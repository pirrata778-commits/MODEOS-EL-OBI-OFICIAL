const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar_logs')
        .setDescription('Configura el canal de auditoría y sanciones.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se publicarán los registros de actividad y las sanciones.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('canal');
        await pool.query(
            `INSERT INTO guild_configs (guild_id, log_channel_id)
             VALUES ($1, $2)
             ON CONFLICT (guild_id) DO UPDATE
             SET log_channel_id = EXCLUDED.log_channel_id`,
            [interaction.guild.id, channel.id]
        );

        return interaction.editReply(`✅ Canal de registros configurado: ${channel}.`);
    }
};
