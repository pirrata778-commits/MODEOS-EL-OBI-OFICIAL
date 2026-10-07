const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        try {
            const result = await pool.query('SELECT * FROM guild_configs WHERE guild_id = $1', [newMember.guild.id]);
            const config = result.rows[0];

            if (!config || !config.admin_scanner_enabled || !config.admin_alert_channel_id) return;

            const hadAdmin = oldMember.permissions.has(PermissionFlagsBits.Administrator);
            const hasAdmin = newMember.permissions.has(PermissionFlagsBits.Administrator);

            // Detección en tiempo real si a un miembro le asignan el permiso de administrador
            if (!hadAdmin && hasAdmin) {
                const alertChannel = newMember.guild.channels.cache.get(config.admin_alert_channel_id)
                    || await newMember.guild.channels.fetch(config.admin_alert_channel_id);
                if (alertChannel?.isTextBased() && typeof alertChannel.send === 'function') {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ ESCÁNER DE ADMINS: Permiso Otorgado')
                        .setColor('#FFA500')
                        .setDescription(`Se han otorgado permisos de **Administrador** a <@${newMember.id}>.`)
                        .setFooter({ text: 'MODEOS EL OBI OFFICIAL • Seguridad' })
                        .setTimestamp();

                    await alertChannel.send({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('Error en guildMemberUpdate:', error);
        }
    }
};