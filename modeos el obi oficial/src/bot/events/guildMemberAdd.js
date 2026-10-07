const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const { pool } = require('../../../config/database');

function replaceWelcomeVariables(text, member) {
    return text
        .replaceAll('{user}', `<@${member.id}>`)
        .replaceAll('{user_tag}', member.user.tag)
        .replaceAll('{server}', member.guild.name)
        .replaceAll('{count}', String(member.guild.memberCount));
}

function getCanvasLibrary() {
    for (const packageName of ['@napi-rs/canvas', 'canvas']) {
        try {
            return require(packageName);
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') {
                console.warn(`No se pudo cargar ${packageName}:`, error.message);
            }
        }
    }
    return null;
}

async function createWelcomeBanner(member) {
    const canvasLibrary = getCanvasLibrary();
    if (!canvasLibrary) return null;

    try {
        const canvas = canvasLibrary.createCanvas(1024, 500);
        const context = canvas.getContext('2d');
        const background = context.createLinearGradient(0, 0, 1024, 500);
        background.addColorStop(0, '#202127');
        background.addColorStop(0.55, '#2B2D31');
        background.addColorStop(1, '#16171A');
        context.fillStyle = background;
        context.fillRect(0, 0, 1024, 500);

        const backgroundUrl = process.env.WELCOME_BACKGROUND_URL
            || member.guild.iconURL({ extension: 'png', size: 512 });
        if (backgroundUrl) {
            try {
                const backgroundImage = await canvasLibrary.loadImage(backgroundUrl);
                context.save();
                context.filter = 'blur(20px)';
                context.globalAlpha = 0.3;
                context.drawImage(backgroundImage, -50, -50, 1124, 600);
                context.restore();
            } catch (error) {
                console.warn('No se pudo cargar el fondo de la bienvenida:', error.message);
            }
        }

        const overlay = context.createLinearGradient(0, 0, 0, 500);
        overlay.addColorStop(0, 'rgba(20, 21, 24, 0.28)');
        overlay.addColorStop(1, 'rgba(20, 21, 24, 0.88)');
        context.fillStyle = overlay;
        context.fillRect(0, 0, 1024, 500);

        context.fillStyle = '#FFFFFF';
        context.font = '700 24px sans-serif';
        context.textAlign = 'left';
        context.fillText('MODEOS EL OBI', 54, 62);
        context.fillStyle = '#AEB4FF';
        context.font = '600 13px sans-serif';
        context.fillText('OFFICIAL COMMUNITY', 56, 84);

        const centerX = 512;
        const centerY = 222;
        const avatarRadius = 92;
        const ring = context.createLinearGradient(centerX - 100, centerY - 100, centerX + 100, centerY + 100);
        ring.addColorStop(0, '#9DA5FF');
        ring.addColorStop(0.5, '#5865F2');
        ring.addColorStop(1, '#80E7D5');
        context.save();
        context.shadowColor = '#5865F2';
        context.shadowBlur = 30;
        context.beginPath();
        context.arc(centerX, centerY, avatarRadius + 7, 0, Math.PI * 2);
        context.fillStyle = ring;
        context.fill();
        context.restore();

        const avatar = await canvasLibrary.loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
        context.save();
        context.beginPath();
        context.arc(centerX, centerY, avatarRadius, 0, Math.PI * 2);
        context.clip();
        context.drawImage(avatar, centerX - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        context.restore();

        const welcomeText = `WELCOME ${member.user.tag}`;
        context.font = '800 40px sans-serif';
        let clippedText = welcomeText;
        while (context.measureText(clippedText).width > 900 && clippedText.length > 12) {
            clippedText = `${clippedText.slice(0, -4)}...`;
        }
        context.textAlign = 'center';
        context.fillStyle = '#FFFFFF';
        context.fillText(clippedText, centerX, 378);
        context.fillStyle = '#C7CAFF';
        context.font = '500 18px sans-serif';
        context.fillText(member.guild.name.slice(0, 80), centerX, 414);
        context.textAlign = 'left';
        context.fillStyle = '#A6A8B0';
        context.font = '500 14px sans-serif';
        context.fillText(`MIEMBRO #${member.guild.memberCount}`, 54, 458);

        return new AttachmentBuilder(await canvas.toBuffer('image/png'), { name: 'bienvenida.png' });
    } catch (error) {
        console.warn('No se pudo generar la tarjeta Canvas de bienvenida:', error.message);
        return null;
    }
}

async function getRulesChannel(guild, config) {
    if (config.rules_channel_id) {
        const configuredChannel = guild.channels.cache.get(config.rules_channel_id)
            || await guild.channels.fetch(config.rules_channel_id).catch(() => null);
        if (configuredChannel?.isTextBased()) return configuredChannel;
    }

    return guild.channels.cache.find(channel =>
        channel.isTextBased() && /^(reglas|normas|normativa|rules)$/i.test(channel.name)
    ) || null;
}

async function buildWelcomePayload(member, config, { preview = false } = {}) {
    const welcomeText = replaceWelcomeVariables(
        config.welcome_message || '¡Hola {user}! Te damos la bienvenida a {server}.',
        member
    );
    const rulesChannel = await getRulesChannel(member.guild, config);
    const buttons = [];
    const buttonsEnabled = config.welcome_enable_buttons !== false;
    if (buttonsEnabled && rulesChannel) {
        buttons.push(new ButtonBuilder()
            .setLabel('📜 Normativa')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${member.guild.id}/${rulesChannel.id}`));
    }
    if (buttonsEnabled) {
        buttons.push(new ButtonBuilder()
            .setCustomId('welcome_ticket')
            .setLabel('🎫 Abrir soporte')
            .setStyle(ButtonStyle.Success));
    }

    const frontendUrl = process.env.FRONTEND_URL;
    if (buttonsEnabled && frontendUrl) {
        try {
            const parsedUrl = new URL(frontendUrl);
            if (['http:', 'https:'].includes(parsedUrl.protocol)) {
                buttons.push(new ButtonBuilder()
                    .setLabel('🌐 Panel web')
                    .setStyle(ButtonStyle.Link)
                    .setURL(parsedUrl.toString()));
            }
        } catch (error) {
            console.warn('FRONTEND_URL no es una URL válida para el botón de bienvenida.');
        }
    }

    const welcomeTitle = replaceWelcomeVariables(
        config.welcome_title || '✨ ⊱┆ BIENVENIDO/A A {server} ┆⊰ ✨',
        member
    );
    const welcomeColor = /^#[0-9A-Fa-f]{6}$/.test(config.welcome_color || '')
        ? config.welcome_color
        : '#5865F2';
    const embed = new EmbedBuilder()
        .setTitle(welcomeTitle)
        .setDescription(welcomeText)
        .setColor(welcomeColor)
        .addFields(
            { name: '👤 Miembro', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: '📊 Contador', value: `¡Eres el usuario #${member.guild.memberCount + Number(preview)}! 🎉`, inline: true },
            {
                name: '🛡️ Sistema de Gestión & Seguridad',
                value: 'Servidor protegido y gestionado por la suite de **MODEOS EL OBI OFFICIAL**.'
            },
            {
                name: '🚀 Guía de Inicio Rápido',
                value: [
                    '• 📜 Revisa la normativa del servidor en el canal de reglas.',
                    '• 🎭 Asígnate tus roles interactivos en el menú de roles.',
                    '• 🎫 ¿Dudas o sugerencias? Abre un ticket de soporte.'
                ].join('\n')
            }
        )
        .setFooter({
            text: `MODEOS EL OBI System • ${member.guild.name}`,
            ...(member.guild.iconURL() ? { iconURL: member.guild.iconURL() } : {})
        })
        .setTimestamp();

    const banner = config.welcome_enable_canvas !== false
        ? await createWelcomeBanner(member)
        : null;
    const fallbackBanner = config.welcome_banner_url
        || process.env.WELCOME_BANNER_URL
        || member.guild.bannerURL({ extension: 'png', size: 1024 })
        || member.guild.iconURL({ extension: 'png', size: 1024 });
    if (banner) {
        embed.setImage('attachment://bienvenida.png');
    } else if (fallbackBanner && /^https:\/\//i.test(fallbackBanner)) {
        embed.setImage(fallbackBanner);
    }

    return {
        embeds: [embed],
        components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [],
        ...(banner ? { files: [banner] } : {}),
        allowedMentions: { users: preview ? [] : [member.id] }
    };
}

module.exports = {
    name: 'guildMemberAdd',
    buildWelcomePayload,
    async execute(member) {
        let config;
        try {
            const result = await pool.query('SELECT * FROM guild_configs WHERE guild_id = $1', [member.guild.id]);
            config = result.rows[0];
        } catch (error) {
            console.error(`No se pudo cargar la configuración de ${member.guild.id}:`, error);
            return;
        }
        if (!config) return;

        if (config.welcome_channel_id) {
            try {
                const welcomeChannel = member.guild.channels.cache.get(config.welcome_channel_id)
                    || await member.guild.channels.fetch(config.welcome_channel_id);
                if (welcomeChannel?.isTextBased() && typeof welcomeChannel.send === 'function') {
                    await welcomeChannel.send(await buildWelcomePayload(member, config));
                }
            } catch (error) {
                console.error(`No se pudo enviar bienvenida para ${member.id}:`, error);
            }
        }

        if (config.admin_scanner_enabled && config.admin_alert_channel_id
            && member.permissions.has(PermissionFlagsBits.Administrator)) {
            try {
                const alertChannel = member.guild.channels.cache.get(config.admin_alert_channel_id)
                    || await member.guild.channels.fetch(config.admin_alert_channel_id);
                if (alertChannel?.isTextBased() && typeof alertChannel.send === 'function') {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ ESCÁNER DE ADMINS | MODEOS EL OBI OFFICIAL')
                        .setColor('#FF0000')
                        .setDescription(`El usuario **${member.user.tag}** (${member.id}) ha ingresado al servidor con permisos de **Administrador**.`)
                        .setFooter({ text: 'MODEOS EL OBI OFFICIAL • Seguridad', iconURL: member.client.user.displayAvatarURL() })
                        .setTimestamp();

                    await alertChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error(`No se pudo enviar alerta de administrador para ${member.id}:`, error);
            }
        }

        const accountAge = Date.now() - member.user.createdTimestamp;
        if (accountAge < 3 * 24 * 60 * 60 * 1000 && config.quarantine_role_id) {
            try {
                const role = member.guild.roles.cache.get(config.quarantine_role_id);
                const botMember = member.guild.members.me;
                if (!role || role.managed || role.id === member.guild.id
                    || !botMember?.permissions.has(PermissionFlagsBits.ManageRoles)
                    || role.position >= botMember.roles.highest.position) {
                    console.error(`No se pudo aplicar cuarentena a ${member.id}: rol no disponible o jerarquía insuficiente.`);
                } else {
                    await member.roles.add(role, 'Cuenta de Discord creada hace menos de 3 días');
                    const alertChannelId = config.log_channel_id || config.admin_alert_channel_id;
                    const alertChannel = alertChannelId
                        && (member.guild.channels.cache.get(alertChannelId)
                            || await member.guild.channels.fetch(alertChannelId));
                    if (alertChannel?.isTextBased() && typeof alertChannel.send === 'function') {
                        await alertChannel.send({
                            embeds: [new EmbedBuilder()
                                .setTitle('🛡️ Cuenta reciente en cuarentena')
                                .setColor('#E67E22')
                                .setDescription(`<@${member.id}> recibió el rol de cuarentena. La cuenta tiene menos de 3 días.`)
                                .setTimestamp()]
                        });
                    }
                }
            } catch (error) {
                console.error(`No se pudo procesar cuarentena para ${member.id}:`, error);
            }
        }
    }
};