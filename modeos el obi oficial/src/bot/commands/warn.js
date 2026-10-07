const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { pool } = require('../../../config/database');
const { sendLog } = require('../events/messageLogUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('advertencia')
        .setDescription('Registra una advertencia para un miembro del servidor.')
        .addUserOption(opt => 
            opt.setName('usuario')
               .setDescription('Miembro que recibirá la advertencia.')
               .setRequired(true))
        .addStringOption(opt => 
            opt.setName('razon')
               .setDescription('Motivo de la advertencia.')
               .setMaxLength(1000)
               .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const usuario = interaction.options.getUser('usuario');
        const razon = interaction.options.getString('razon');
        const member = await interaction.guild.members.fetch(usuario.id);
        const moderator = await interaction.guild.members.fetch(interaction.user.id);

        if (!moderator.permissions.has(PermissionFlagsBits.Administrator)
            && member.roles.highest.position >= moderator.roles.highest.position) {
            return interaction.editReply('Solo puedes moderar a miembros con un rol inferior al tuyo.');
        }

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Advertencia registrada')
            .setColor('#FFA500')
            .addFields(
                { name: 'Usuario', value: `${usuario.tag} (${usuario.id})`, inline: true },
                { name: 'Moderador', value: `${interaction.user.tag}`, inline: true },
                { name: 'Razón', value: razon }
            )
            .setTimestamp();

        await pool.query(
            `INSERT INTO sanctions (guild_id, user_id, moderator_id, type, reason)
             VALUES ($1, $2, $3, 'WARN', $4)`,
            [interaction.guild.id, usuario.id, interaction.user.id, razon]
        );

        let logged;
        try {
            logged = await sendLog(interaction.guild, interaction.client, embed);
        } catch (error) {
            console.error('Advertencia guardada, pero no se pudo enviar al canal de registros:', error);
            return interaction.editReply('La advertencia se guardó, pero no se pudo enviar al canal de registros.');
        }

        await interaction.editReply({
            content: logged
                ? `✅ Advertencia registrada para ${usuario}.`
                : `✅ Advertencia registrada para ${usuario}. No hay un canal de registros configurado.`
        });
    }
};