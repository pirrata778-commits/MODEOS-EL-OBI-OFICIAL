const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const { hasRestrictedPermissions } = require('../utils/selfRolePermissions');
const { pool } = require('../../../config/database');
const { closeTicket, handleTicketRating } = require('../commands/ticketClose');
const { buildWelcomePayload } = require('./guildMemberAdd');
const {
    createCaptchaChallenge,
    consumeCaptchaChallenge
} = require('../utils/captcha');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (interaction.isButton()) {
            try {
                if (interaction.customId === 'create_ticket') {
                    await createTicket(interaction);
                } else if (interaction.customId.startsWith('welcome_preview:')) {
                    await sendWelcomePreview(interaction);
                } else if (interaction.customId === 'welcome_ticket') {
                    await openWelcomeTicketModal(interaction);
                } else if (interaction.customId === 'close_ticket') {
                    await closeTicket(interaction);
                } else if (interaction.customId.startsWith('ticket_rating:')) {
                    await handleTicketRating(interaction);
                } else if (interaction.customId.startsWith('suggestion_vote:')) {
                    await handleSuggestionVote(interaction);
                } else if (interaction.customId.startsWith('selfrole:')) {
                    await handleSelfRole(interaction);
                } else if (interaction.customId === 'captcha_start') {
                    await startCaptcha(interaction);
                } else if (interaction.customId.startsWith('staff_accept:')
                    || interaction.customId.startsWith('staff_reject:')) {
                    await resolveStaffApplication(interaction);
                }
            } catch (error) {
                console.error('Error al gestionar el botón:', error);
                const reply = { content: 'Ocurrió un error al gestionar esta interacción.', ephemeral: true };
                if (interaction.replied) {
                    await interaction.followUp(reply);
                } else if (interaction.deferred) {
                    await interaction.editReply(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('captcha_answer:')) {
            try {
                await completeCaptcha(interaction);
            } catch (error) {
                console.error('Error al procesar captcha:', error);
                const response = 'No se pudo completar la verificación. Inténtalo de nuevo más tarde.';
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(response);
                } else {
                    await interaction.reply({ content: response, ephemeral: true });
                }
            }
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
            try {
                const { EmbedBuilder } = require('discord.js');
                const help = interaction.client.commands.get('ayuda');
                const category = interaction.values[0];
                const categoryCommands = help?.categories?.[category] || [];
                const embed = new EmbedBuilder()
                    .setTitle(`Ayuda • ${category}`)
                    .setColor('#5865F2')
                    .setDescription(categoryCommands.length
                        ? categoryCommands.map(name => {
                            const command = interaction.client.commands.get(name);
                            return command
                                ? `\`/${command.data.name}\` — ${command.data.description}`
                                : `\`/${name}\``;
                        }).join('\n')
                        : 'No hay comandos disponibles en esta categoría.')
                    .setTimestamp();
                return await interaction.update({ embeds: [embed] });
            } catch (error) {
                console.error('Error al mostrar categoría del menú de ayuda:', error);
                if (interaction.replied || interaction.deferred) {
                    return interaction.followUp({ content: 'No se pudo cargar esta categoría.', ephemeral: true });
                }
                return interaction.reply({ content: 'No se pudo cargar esta categoría.', ephemeral: true });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'welcome_ticket_modal') {
            try {
                await createTicket(interaction, {
                    subject: interaction.fields.getTextInputValue('ticket_subject'),
                    description: interaction.fields.getTextInputValue('ticket_description')
                });
            } catch (error) {
                console.error('Error al crear la solicitud desde bienvenida:', error);
                const response = { content: 'No se pudo crear la solicitud de soporte.' };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(response);
                } else {
                    await interaction.reply({ ...response, ephemeral: true });
                }
            }
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId === 'staff_application') {
            try {
                await submitStaffApplication(interaction);
            } catch (error) {
                console.error('Error al registrar postulación de Staff:', error);
                const response = { content: 'No se pudo enviar la postulación. Avísale a un administrador.' };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(response);
                } else {
                    await interaction.reply({ ...response, ephemeral: true });
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await pool.query(
                `INSERT INTO access_logs (source, action_type, guild_id, user_id, user_tag, details)
                 VALUES ('BOT', 'COMMAND_USED', $1, $2, $3, $4)`,
                [interaction.guildId, interaction.user.id, interaction.user.tag.slice(0, 100), interaction.commandName]
            ).catch(error => {
                console.error(`No se pudo registrar el uso de /${interaction.commandName}:`, error);
            });
            await command.execute(interaction);
        } catch (error) {
            console.error('Error al ejecutar comando:', error);
            if (interaction.replied) {
                await interaction.followUp({ content: 'Ocurrió un error al ejecutar este comando.', ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: 'Ocurrió un error al ejecutar este comando.' });
            } else {
                await interaction.reply({ content: 'Ocurrió un error al ejecutar este comando.', ephemeral: true });
            }
        }
    }
};

async function sendWelcomePreview(interaction) {
    if (!interaction.inGuild()
        || (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
            && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))) {
        return interaction.reply({
            content: 'Necesitas permisos de Administrador o Gestionar servidor para enviar la vista previa.',
            ephemeral: true
        });
    }

    const [, guildId, channelId] = interaction.customId.split(':');
    if (guildId !== interaction.guildId || !/^\d{1,32}$/.test(channelId || '')) {
        return interaction.reply({ content: 'Esta vista previa no es válida para este servidor.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const { rows } = await pool.query(
        'SELECT * FROM guild_configs WHERE guild_id = $1 AND welcome_channel_id = $2',
        [guildId, channelId]
    );
    const config = rows[0];
    const channel = config && (
        interaction.guild.channels.cache.get(channelId)
        || await interaction.guild.channels.fetch(channelId).catch(() => null)
    );
    if (!config || !channel?.isTextBased() || typeof channel.send !== 'function') {
        return interaction.editReply('El canal de bienvenida ya no está configurado o no está disponible.');
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    await channel.send(await buildWelcomePayload(member, config, { preview: true }));
    return interaction.editReply(`✅ Vista previa enviada a ${channel}.`);
}

async function openWelcomeTicketModal(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'Las solicitudes de soporte solo pueden abrirse desde un servidor.', ephemeral: true });
    }

    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder()
        .setCustomId('welcome_ticket_modal')
        .setTitle('Abrir solicitud de soporte')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('ticket_subject')
                    .setLabel('Asunto')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(100)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('ticket_description')
                    .setLabel('¿En qué podemos ayudarte?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000)
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
}

async function createTicket(interaction, request = {}) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'Los tickets solo pueden crearse en un servidor.', ephemeral: true });
    }

    const { guild, user, client } = interaction;
    const ticketTopic = `ticket-owner:${user.id}`;
    const existingTicket = guild.channels.cache.find(channel =>
        channel.topic === ticketTopic
    );

    if (existingTicket) {
        return interaction.reply({
            content: `Ya tienes un ticket abierto: ${existingTicket}`,
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });
    const administratorRoles = guild.roles.cache.filter(role =>
        role.id !== guild.id
        && role.permissions.has(PermissionFlagsBits.Administrator)
    );
    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        ...administratorRoles.map(role => ({
            id: role.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        }))
    ];

    const channel = await guild.channels.create({
        name: `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
        type: ChannelType.GuildText,
        topic: ticketTopic,
        permissionOverwrites,
        reason: `Ticket de soporte solicitado por ${user.tag}`
    });

    const closeButton = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('🔒 Cerrar Ticket')
        .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(closeButton);
    const embed = new EmbedBuilder()
        .setTitle(request.subject ? `🎫 ${request.subject}` : '🎫 Ticket de soporte')
        .setDescription(request.description
            ? `${user}, ${request.description}`
            : `${user}, describe tu consulta y un administrador te ayudará pronto.`)
        .setColor('#5865F2')
        .setTimestamp();

    try {
        await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        await channel.delete('No se pudo inicializar el ticket');
        throw error;
    }
    await interaction.editReply({ content: `Tu ticket está listo: ${channel}` });
}

async function handleSuggestionVote(interaction) {
    const vote = interaction.customId.endsWith(':up') ? 1 : -1;
    await interaction.deferReply({ ephemeral: true });

    const { pool } = require('../../../config/database');
    const inserted = await pool.query(
        `INSERT INTO suggestion_votes (message_id, user_id, vote)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id) DO NOTHING
         RETURNING vote`,
        [interaction.message.id, interaction.user.id, vote]
    );

    if (!inserted.rowCount) {
        return interaction.editReply('Ya has votado esta sugerencia; no se permiten votos duplicados.');
    }

    const counts = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE vote = 1)::int AS upvotes,
            COUNT(*) FILTER (WHERE vote = -1)::int AS downvotes
         FROM suggestion_votes
         WHERE message_id = $1`,
        [interaction.message.id]
    );
    const embed = interaction.message.embeds[0];
    if (!embed) {
        throw new Error(`La sugerencia ${interaction.message.id} no contiene un embed.`);
    }

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('suggestion_vote:up')
            .setLabel(`👍 ${counts.rows[0].upvotes}`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('suggestion_vote:down')
            .setLabel(`👎 ${counts.rows[0].downvotes}`)
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.message.edit({ embeds: [embed], components: [row] });
    return interaction.editReply('✅ Tu voto ha sido registrado.');
}

async function startCaptcha(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'La verificación solo está disponible en servidores.', ephemeral: true });
    }

    return interaction.reply(createCaptchaChallenge(interaction.user.id, interaction.guildId));
}

async function completeCaptcha(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'La verificación solo está disponible en un servidor.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const challengeId = interaction.customId.slice('captcha_answer:'.length);
    const validAnswer = consumeCaptchaChallenge(
        challengeId,
        interaction.user.id,
        interaction.guildId,
        interaction.values[0]
    );
    if (!validAnswer) {
        return interaction.editReply('❌ Respuesta incorrecta. Pulsa Verificarme para intentarlo de nuevo.');
    }

    const { pool } = require('../../../config/database');
    const result = await pool.query(
        'SELECT verify_role_id FROM guild_configs WHERE guild_id = $1',
        [interaction.guildId]
    );
    const role = result.rows[0]?.verify_role_id
        && interaction.guild.roles.cache.get(result.rows[0].verify_role_id);
    const botMember = interaction.guild.members.me;

    if (!role || role.managed || role.id === interaction.guild.id) {
        return interaction.editReply('La verificación no está configurada correctamente. Avísale a un administrador.');
    }
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)
        || role.position >= botMember.roles.highest.position) {
        return interaction.editReply('El bot no puede asignar el rol configurado. Avísale a un administrador.');
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Captcha de verificación completado');
    }
    return interaction.editReply('✅ Verificación completada. Ya tienes acceso al servidor.');
}

async function submitStaffApplication(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'Las postulaciones solo están disponibles dentro de un servidor.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const { pool } = require('../../../config/database');
    const { rows } = await pool.query(
        'SELECT staff_review_channel_id FROM guild_configs WHERE guild_id = $1',
        [interaction.guildId]
    );
    const channelId = rows[0]?.staff_review_channel_id;
    const channel = channelId
        && (interaction.guild.channels.cache.get(channelId)
            || await interaction.guild.channels.fetch(channelId));

    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        return interaction.editReply('El canal de revisión de Staff no está configurado. Contacta a un administrador.');
    }

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
        .setTitle('📋 Nueva postulación a Staff')
        .setColor('#5865F2')
        .setDescription(`Postulante: <@${interaction.user.id}> (${interaction.user.tag})`)
        .addFields(
            { name: 'Edad', value: interaction.fields.getTextInputValue('age'), inline: true },
            { name: 'Experiencia', value: interaction.fields.getTextInputValue('experience').slice(0, 1024) },
            { name: 'Motivación', value: interaction.fields.getTextInputValue('motivation').slice(0, 1024) }
        )
        .setFooter({ text: `Aplicante: ${interaction.user.id}` })
        .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`staff_accept:${interaction.guildId}:${interaction.user.id}`)
            .setLabel('Aceptar')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`staff_reject:${interaction.guildId}:${interaction.user.id}`)
            .setLabel('Rechazar')
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row], allowedMentions: { users: [] } });
    return interaction.editReply('✅ Tu postulación se envió al equipo de Staff.');
}

async function resolveStaffApplication(interaction) {
    if (!interaction.inGuild()
        || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: 'Solo el equipo autorizado con Gestionar servidor puede resolver postulaciones.',
            ephemeral: true
        });
    }

    const [action, guildId, applicantId] = interaction.customId.split(':');
    if (guildId !== interaction.guildId || !/^\d{1,32}$/.test(applicantId || '')) {
        return interaction.reply({ content: 'Esta postulación no es válida para este servidor.', ephemeral: true });
    }

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    const embed = interaction.message.embeds[0];
    if (!embed) {
        return interaction.reply({ content: 'No se encontró la postulación original.', ephemeral: true });
    }
    const accepted = action === 'staff_accept';
    const updated = EmbedBuilder.from(embed)
        .setColor(accepted ? '#2ECC71' : '#E74C3C')
        .addFields({
            name: 'Resolución',
            value: `${accepted ? 'Aceptada' : 'Rechazada'} por ${interaction.user.tag}`
        });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('staff_resolved').setLabel('Resuelta').setStyle(
            accepted ? ButtonStyle.Success : ButtonStyle.Danger
        ).setDisabled(true)
    );

    await interaction.update({ embeds: [updated], components: [row] });
    try {
        const applicant = await interaction.client.users.fetch(applicantId);
        await applicant.send(
            `Tu postulación a Staff en **${interaction.guild.name}** fue ${accepted ? 'aceptada' : 'rechazada'}.`
        );
    } catch (error) {
        console.error(`No se pudo notificar al postulante ${applicantId}:`, error);
    }
}

async function handleSelfRole(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'Los roles solo pueden gestionarse en un servidor.', ephemeral: true });
    }

    const roleId = interaction.customId.slice('selfrole:'.length);
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role || role.managed || role.id === interaction.guild.id || hasRestrictedPermissions(role)) {
        return interaction.reply({ content: 'Este rol ya no está disponible.', ephemeral: true });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)
        || role.position >= botMember.roles.highest.position) {
        return interaction.reply({ content: 'El bot no tiene permisos o jerarquía suficientes para gestionar este rol.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Self-role quitado por el usuario');
        return interaction.editReply({ content: `Se te quitó el rol ${role}.` });
    }

    await member.roles.add(role, 'Self-role asignado por el usuario');
    return interaction.editReply({ content: `Se te asignó el rol ${role}.` });
}
