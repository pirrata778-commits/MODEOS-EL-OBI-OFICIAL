const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('escanear_admins')
        .setDescription('Configura las alertas del escaneo de administradores.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se enviarán las alertas del escaneo.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('activo')
                .setDescription('Indica si se activará el escaneo automático de administradores.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('canal');
        const enabled = interaction.options.getBoolean('activo');

        await pool.query(
            `INSERT INTO guild_configs (guild_id, admin_alert_channel_id, admin_scanner_enabled)
             VALUES ($1, $2, $3)
             ON CONFLICT (guild_id) DO UPDATE SET
                admin_alert_channel_id = EXCLUDED.admin_alert_channel_id,
                admin_scanner_enabled = EXCLUDED.admin_scanner_enabled`,
            [interaction.guild.id, channel.id, enabled]
        );

        return interaction.editReply({
            content: `✅ Escáner ${enabled ? 'activado' : 'desactivado'} en ${channel}.`
        });
    }
};
