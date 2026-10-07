const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { pool } = require('../../../config/database');
const { sendLog } = require('../events/messageLogUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desilenciar')
        .setDescription('Retira el silencio temporal de un miembro del servidor.')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Miembro al que se retirará el silencio temporal.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('usuario');
        const member = await interaction.guild.members.fetch(user.id);
        const moderator = await interaction.guild.members.fetch(interaction.user.id);

        if (!member.moderatable) {
            return interaction.editReply({
                content: 'No puedo moderar a ese miembro. Comprueba los permisos y la jerarquía de roles del bot.',
            });
        }
        if (!moderator.permissions.has(PermissionFlagsBits.Administrator)
            && member.roles.highest.position >= moderator.roles.highest.position) {
            return interaction.editReply({ content: 'Solo puedes moderar a miembros con un rol inferior al tuyo.' });
        }
        if (!member.communicationDisabledUntilTimestamp) {
            return interaction.editReply({ content: 'Ese miembro no tiene un silencio temporal activo.' });
        }

        await member.timeout(null, `Silencio temporal retirado por ${interaction.user.tag}`);
        try {
            await pool.query(
                `UPDATE sanctions
                 SET expires_at = CURRENT_TIMESTAMP
                 WHERE id = (
                     SELECT id
                     FROM sanctions
                     WHERE guild_id = $1
                       AND user_id = $2
                       AND type = 'MUTE'
                       AND expires_at > CURRENT_TIMESTAMP
                     ORDER BY created_at DESC
                     LIMIT 1
                 )`,
                [interaction.guild.id, user.id]
            );
        } catch (error) {
            console.error('Silencio temporal retirado, pero no se pudo actualizar la sanción en Neon DB:', error);
            return interaction.editReply('El silencio temporal se retiró, pero no se pudo actualizar el registro en la base de datos.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🔊 Silencio temporal retirado')
            .setColor('#2ECC71')
            .addFields(
                { name: 'Usuario', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderador', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();
        let logged;
        try {
            logged = await sendLog(interaction.guild, interaction.client, embed);
        } catch (error) {
            console.error('Silencio temporal retirado, pero no se pudo enviar al canal de registros:', error);
            return interaction.editReply('El silencio temporal se retiró y el registro se actualizó, pero no se pudo enviar al canal de registros.');
        }

        return interaction.editReply({
            content: logged
                ? `✅ Se retiró el silencio temporal de ${user} y se actualizó el registro.`
                : `✅ Se retiró el silencio temporal de ${user}. No hay un canal de registros configurado.`
        });
    }
};
