const { pool } = require('../../../config/database');

async function getLogChannel(guild, client) {
    const { rows } = await pool.query(
        'SELECT log_channel_id FROM guild_configs WHERE guild_id = $1',
        [guild.id]
    );
    const channelId = rows[0]?.log_channel_id;
    if (!channelId) return null;

    const channel = guild.channels.cache.get(channelId)
        || await client.channels.fetch(channelId);

    return channel?.guild?.id === guild.id && typeof channel.send === 'function'
        ? channel
        : null;
}

function truncate(value, maxLength = 1024) {
    if (!value) return '(sin contenido de texto)';
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

async function sendLog(guild, client, embed) {
    const channel = await getLogChannel(guild, client);
    if (!channel) return false;
    await channel.send({ embeds: [embed] });
    return true;
}

module.exports = { getLogChannel, sendLog, truncate };
