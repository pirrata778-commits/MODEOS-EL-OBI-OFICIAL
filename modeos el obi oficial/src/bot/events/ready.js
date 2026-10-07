const { pool } = require('../../../config/database');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        const guildCount = client.guilds.cache.size;
        const memberCount = client.guilds.cache.reduce(
            (total, guild) => total + guild.memberCount,
            0
        );

        console.log(
            `🤖 MODEOS EL OBI OFFICIAL iniciado como: ${client.user.tag} | ${guildCount} servidores | ${memberCount} miembros`
        );
        client.user.setActivity('MODEOS EL OBI OFFICIAL', { type: 0 });
        cleanupTemporaryVoiceChannels(client).catch(error => {
            console.error('Error al recuperar canales de voz temporales:', error);
        });
    }
};

async function cleanupTemporaryVoiceChannels(client) {
    const { rows } = await pool.query(
        'SELECT channel_id, guild_id FROM temporary_voice_channels'
    );
    for (const row of rows) {
        try {
            const guild = client.guilds.cache.get(row.guild_id);
            const channel = guild && (
                guild.channels.cache.get(row.channel_id)
                || await guild.channels.fetch(row.channel_id)
            );
            if (!channel || channel.members.size === 0) {
                if (channel) await channel.delete('Limpieza de canal temporal vacío al iniciar');
                await pool.query(
                    'DELETE FROM temporary_voice_channels WHERE channel_id = $1',
                    [row.channel_id]
                );
            }
        } catch (error) {
            console.error(`No se pudo limpiar el canal temporal ${row.channel_id}:`, error);
        }
    }
}