const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { pool } = require('../../../config/database');
const { sendLog } = require('../events/messageLogUtils');

const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('silenciar')
        .setDescription('Aplica un silencio temporal a un miembro del servidor.')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Miembro al que se aplicará el silencio temporal.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('minutos')
                .setDescription('Duración del silencio en minutos, hasta un máximo de 28 días.')
                .setMinValue(1)
                .setMaxValue(MAX_TIMEOUT_MINUTES)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Motivo de la sanción.')
                .setMaxLength(1000)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('usuario');
        const minutes = interaction.options.getInteger('minutos');
        const reason = interaction.options.getString('razon');
        const member = await interaction.guild.members.fetch(user.id);
        const moderator = await interaction.guild.members.fetch(interaction.user.id);

        if (user.id === interaction.user.id || user.id === interaction.client.user.id) {
            return interaction.editReply({ content: 'No puedes silenciar a ese usuario.' });
        }
        if (!moderator.permissions.has(PermissionFlagsBits.Administrator)
            && member.roles.highest.position >= moderator.roles.highest.position) {
            return interaction.editReply({ content: 'Solo puedes moderar a miembros con un rol inferior al tuyo.' });
        }
        if (!member.moderatable) {
            return interaction.editReply({
                content: 'No puedo moderar a ese miembro. Comprueba los permisos y la jerarquía de roles del bot.',
            });
        }

        const expiresAt = new Date(Date.now() + minutes * 60_000);
        await member.timeout(minutes * 60_000, reason);
        try {
            await pool.query(
                `INSERT INTO sanctions (guild_id, user_id, moderator_id, type, reason, expires_at)
                 VALUES ($1, $2, $3, 'MUTE', $4, $5)`,
                [interaction.guild.id, user.id, interaction.user.id, reason, expiresAt]
            );
        } catch (error) {
            console.error('Silencio temporal aplicado, pero no se pudo guardar la sanción en Neon DB:', error);
            return interaction.editReply('El silencio temporal se aplicó, pero no se pudo guardar en la base de datos. Revisa el registro del bot.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🔇 Silencio temporal aplicado')
            .setColor('#E67E22')
            .addFields(
                { name: 'Usuario', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderador', value: `${interaction.user.tag}`, inline: true },
                { name: 'Duración', value: `${minutes} minutos`, inline: true },
                { name: 'Razón', value: reason }
            )
            .setTimestamp();
        let logged;
        try {
            logged = await sendLog(interaction.guild, interaction.client, embed);
        } catch (error) {
            console.error('Silencio temporal guardado, pero no se pudo enviar al canal de registros:', error);
            return interaction.editReply('El silencio temporal se aplicó y guardó, pero no se pudo enviar al canal de registros.');
        }

        return interaction.editReply({
            content: logged
                ? `✅ Silencio temporal aplicado a ${user} durante ${minutes} minutos y registrado.`
                : `✅ Silencio temporal aplicado a ${user} y guardado. No hay un canal de registros configurado.`
        });
    }
};
