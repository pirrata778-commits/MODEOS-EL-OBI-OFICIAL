const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../../config/database');
const client = require('../../bot/client');
const {
    requireAuth,
    requireFrontendOrigin,
    requireGuildAdministrator,
    safeEqual
} = require('./auth');

const router = express.Router();
const settingsColumns = {
    welcome_channel_id: 'welcome_channel_id',
    welcome_message: 'welcome_message',
    welcome_title: 'welcome_title',
    welcome_color: 'welcome_color',
    welcome_banner_url: 'welcome_banner_url',
    welcome_enable_canvas: 'welcome_enable_canvas',
    welcome_enable_buttons: 'welcome_enable_buttons',
    admin_alert_channel_id: 'admin_alert_channel_id',
    admin_scanner_enabled: 'admin_scanner_enabled',
    verify_role_id: 'verify_role_id',
    suggestion_channel_id: 'suggestion_channel_id',
    log_channel_id: 'log_channel_id',
    quarantine_role_id: 'quarantine_role_id',
    voice_generator_channel_id: 'voice_generator_channel_id',
    social_channel_id: 'social_channel_id',
    staff_review_channel_id: 'staff_review_channel_id',
    vip_role_id: 'vip_role_id',
    rules_channel_id: 'rules_channel_id'
};
const idSettingKeys = new Set([
    'welcome_channel_id',
    'admin_alert_channel_id',
    'verify_role_id',
    'suggestion_channel_id',
    'log_channel_id',
    'quarantine_role_id',
    'voice_generator_channel_id',
    'social_channel_id',
    'staff_review_channel_id',
    'vip_role_id',
    'rules_channel_id'
]);

router.get('/reviews/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!/^\d{1,32}$/.test(userId)) {
        return res.status(400).json({ success: false, error: 'El ID de usuario no es válido.' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT id, target_user_id, author_id, rating, comment, created_at
             FROM reviews
             WHERE target_user_id = $1
             ORDER BY created_at DESC, id DESC`,
            [userId]
        );
        return res.json({ success: true, reviews: rows });
    } catch (error) {
        console.error('Error al consultar reseñas de la API:', error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar las reseñas.' });
    }
});

router.get('/guilds', requireAuth, async (req, res) => {
    try {
        const guildResults = await Promise.all(client.guilds.cache.map(async guild => {
            try {
                const member = await guild.members.fetch(req.authUser.id);
                if (!member.permissions.has(PermissionFlagsBits.Administrator)
                    && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return null;
                }
                return {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL()
                };
            } catch (error) {
                if (['10007', '10013'].includes(String(error.code))) return null;
                throw error;
            }
        }));
        return res.json({ success: true, guilds: guildResults.filter(Boolean) });
    } catch (error) {
        console.error('Error al cargar los servidores administrables:', error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar tus servidores.' });
    }
});

router.get('/guilds/:guildId/channels', requireAuth, requireGuildAdministrator, async (req, res) => {
    try {
        const member = await req.guild.members.fetch(req.authUser.id);
        const channels = req.guild.channels.cache
            .filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
                && member.permissionsIn(channel).has(PermissionFlagsBits.ViewChannel))
            .map(channel => ({ id: channel.id, name: channel.name }));
        return res.json({ success: true, channels });
    } catch (error) {
        console.error(`Error al cargar canales de ${req.params.guildId}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar los canales.' });
    }
});

router.get('/settings/:guildId', requireAuth, requireGuildAdministrator, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM guild_configs WHERE guild_id = $1',
            [req.params.guildId]
        );
        return res.json({ success: true, settings: rows[0] || null });
    } catch (error) {
        console.error(`Error al leer configuración de ${req.params.guildId}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudo leer la configuración.' });
    }
});

router.post('/settings/:guildId', requireAuth, requireFrontendOrigin, requireGuildAdministrator, async (req, res) => {
    const entries = Object.entries(req.body || {});
    if (!entries.length || entries.some(([key]) => !Object.hasOwn(settingsColumns, key))) {
        return res.status(400).json({ success: false, error: 'La configuración contiene campos no permitidos o está vacía.' });
    }
    for (const [key, value] of entries) {
        if (idSettingKeys.has(key) && value !== null
            && (typeof value !== 'string' || !/^\d{1,32}$/.test(value))) {
            return res.status(400).json({ success: false, error: `El valor de ${key} debe ser un ID válido o null.` });
        }
        if (key === 'welcome_message' && value !== null
            && (typeof value !== 'string' || value.length > 2000)) {
            return res.status(400).json({ success: false, error: 'welcome_message debe ser texto de hasta 2000 caracteres.' });
        }
        if (key === 'welcome_title' && value !== null
            && (typeof value !== 'string' || value.length > 150)) {
            return res.status(400).json({ success: false, error: 'welcome_title debe ser texto de hasta 150 caracteres.' });
        }
        if (key === 'welcome_color' && value !== null
            && (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value))) {
            return res.status(400).json({ success: false, error: 'welcome_color debe ser un color hexadecimal válido, como #5865F2.' });
        }
        if (key === 'welcome_banner_url' && value !== null) {
            try {
                if (typeof value !== 'string' || value.length > 2048 || new URL(value).protocol !== 'https:') {
                    throw new Error('invalid URL');
                }
            } catch {
                return res.status(400).json({ success: false, error: 'welcome_banner_url debe ser una URL HTTPS válida o null.' });
            }
        }
        if (['welcome_enable_canvas', 'welcome_enable_buttons'].includes(key)
            && typeof value !== 'boolean') {
            return res.status(400).json({ success: false, error: `${key} debe ser booleano.` });
        }
        if (key === 'admin_scanner_enabled' && typeof value !== 'boolean') {
            return res.status(400).json({ success: false, error: 'admin_scanner_enabled debe ser booleano.' });
        }
    }

    const columns = entries.map(([key]) => settingsColumns[key]);
    const values = entries.map(([, value]) => value);
    const placeholders = values.map((_, index) => `$${index + 2}`);
    const updates = columns.map(column => `${column} = EXCLUDED.${column}`).join(', ');

    try {
        const { rows } = await pool.query(
            `INSERT INTO guild_configs (guild_id, ${columns.join(', ')})
             VALUES ($1, ${placeholders.join(', ')})
             ON CONFLICT (guild_id) DO UPDATE SET ${updates}
             RETURNING *`,
            [req.params.guildId, ...values]
        );
        return res.json({ success: true, settings: rows[0] });
    } catch (error) {
        console.error(`Error al guardar configuración de ${req.params.guildId}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudo guardar la configuración.' });
    }
});

router.get('/tickets/transcripts/:guildId', requireAuth, requireGuildAdministrator, async (req, res) => {
    try {
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isInteger(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 100)
            : 50;
        const { rows } = await pool.query(
            `SELECT transcript.id, transcript.channel_id, transcript.owner_id,
                    transcript.closed_by_id, transcript.message_count, transcript.created_at,
                    rating.rating
             FROM ticket_transcripts AS transcript
             LEFT JOIN ticket_ratings AS rating ON rating.transcript_id = transcript.id
             WHERE transcript.guild_id = $1
             ORDER BY transcript.created_at DESC
             LIMIT $2`,
            [req.params.guildId, limit]
        );
        return res.json({ success: true, transcripts: rows });
    } catch (error) {
        console.error(`Error al consultar transcripciones de ${req.params.guildId}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar las transcripciones.' });
    }
});

router.get('/tickets/transcript/:id', requireAuth, async (req, res) => {
    if (!/^\d{1,10}$/.test(req.params.id)) {
        return res.status(400).json({ success: false, error: 'El identificador de la transcripción no es válido.' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT id, guild_id, channel_id, owner_id, closed_by_id,
                    message_count, messages, created_at
             FROM ticket_transcripts
             WHERE id = $1`,
            [Number(req.params.id)]
        );
        const transcript = rows[0];
        if (!transcript) {
            return res.status(404).json({ success: false, error: 'No se encontró la transcripción.' });
        }

        const guild = client.guilds.cache.get(transcript.guild_id);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'El bot no está en el servidor de esta transcripción.' });
        }
        const member = await guild.members.fetch(req.authUser.id).catch(() => null);
        if (!member) {
            return res.status(403).json({ success: false, error: 'No perteneces a este servidor.' });
        }
        if (!member.permissions.has(PermissionFlagsBits.Administrator)
            && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return res.status(403).json({ success: false, error: 'Se requieren permisos de administración del servidor.' });
        }

        return res.json({ success: true, transcript });
    } catch (error) {
        console.error(`Error al consultar la transcripción ${req.params.id}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudo consultar la transcripción.' });
    }
});

router.get('/tickets/stats/:guildId', requireAuth, requireGuildAdministrator, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(DISTINCT transcript.id)::int AS total_closed,
                    COUNT(rating.id)::int AS total_ratings,
                    ROUND(AVG(rating.rating)::numeric, 2) AS average_rating
             FROM ticket_transcripts AS transcript
             LEFT JOIN ticket_ratings AS rating ON rating.transcript_id = transcript.id
             WHERE transcript.guild_id = $1`,
            [req.params.guildId]
        );
        return res.json({ success: true, stats: rows[0] });
    } catch (error) {
        console.error(`Error al consultar estadísticas de tickets de ${req.params.guildId}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar las estadísticas de tickets.' });
    }
});

router.get('/analytics/:guildId', requireAuth, requireGuildAdministrator, async (req, res) => {
    try {
        const [sanctions, ratings, commandUsage] = await Promise.all([
            pool.query(
                `SELECT date_trunc('day', created_at)::date::text AS date,
                        type,
                        COUNT(*)::int AS total
                 FROM sanctions
                 WHERE guild_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                 GROUP BY date_trunc('day', created_at)::date, type
                 ORDER BY date ASC, type ASC`,
                [req.params.guildId]
            ),
            pool.query(
                `SELECT rating, COUNT(*)::int AS total
                 FROM ticket_ratings
                 WHERE guild_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                 GROUP BY rating
                 ORDER BY rating ASC`,
                [req.params.guildId]
            ),
            pool.query(
                `SELECT details AS command_name, COUNT(*)::int AS total
                 FROM access_logs
                 WHERE guild_id = $1
                   AND source = 'BOT'
                   AND action_type = 'COMMAND_USED'
                   AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                 GROUP BY details
                 ORDER BY total DESC, command_name ASC
                 LIMIT 20`,
                [req.params.guildId]
            )
        ]);
        const ratingCount = ratings.rows.reduce((total, row) => total + row.total, 0);
        const weightedRating = ratings.rows.reduce((total, row) => total + row.rating * row.total, 0);

        return res.json({
            success: true,
            period_days: 30,
            sanctions_by_day: sanctions.rows,
            support_ratings: {
                total: ratingCount,
                average: ratingCount ? Number((weightedRating / ratingCount).toFixed(2)) : null,
                distribution: ratings.rows
            },
            command_usage: commandUsage.rows
        });
    } catch (error) {
        console.error(`Error al consultar analítica de ${req.params.guildId}:`, error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar las estadísticas del servidor.' });
    }
});

router.post('/webhooks/purchase', async (req, res) => {
    const webhookSecret = process.env.PURCHASE_WEBHOOK_SECRET;
    const providedSecret = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!webhookSecret) {
        return res.status(503).json({ success: false, error: 'El endpoint de compras no está configurado.' });
    }
    if (!providedSecret || !safeEqual(providedSecret, webhookSecret)) {
        return res.status(401).json({ success: false, error: 'Credencial de compra no válida.' });
    }

    const { eventId, guildId, userId } = req.body || {};
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(eventId)
        || typeof guildId !== 'string' || !/^\d{1,32}$/.test(guildId)
        || typeof userId !== 'string' || !/^\d{1,32}$/.test(userId)) {
        return res.status(400).json({ success: false, error: 'El evento, servidor o usuario no es válido.' });
    }

    try {
        const existingEvent = await pool.query(
            'SELECT event_id FROM purchase_events WHERE event_id = $1',
            [eventId]
        );
        if (existingEvent.rowCount) {
            return res.json({ success: true, duplicate: true, message: 'La compra ya se había procesado.' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'El bot no está en el servidor indicado.' });
        }
        const settings = await pool.query(
            'SELECT vip_role_id FROM guild_configs WHERE guild_id = $1',
            [guildId]
        );
        const vipRoleId = settings.rows[0]?.vip_role_id;
        if (!vipRoleId) {
            return res.status(409).json({ success: false, error: 'No hay un rol VIP configurado para este servidor.' });
        }

        const role = guild.roles.cache.get(vipRoleId) || await guild.roles.fetch(vipRoleId);
        const botMember = guild.members.me;
        if (!role || role.managed || role.id === guild.id
            || !botMember?.permissions.has(PermissionFlagsBits.ManageRoles)
            || role.position >= botMember.roles.highest.position) {
            return res.status(409).json({ success: false, error: 'El rol VIP no está disponible o el bot no puede asignarlo.' });
        }

        const member = await guild.members.fetch(userId);
        if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role, `Compra externa ${eventId}`);
        }
        const inserted = await pool.query(
            `INSERT INTO purchase_events (event_id, guild_id, user_id, role_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (event_id) DO NOTHING
             RETURNING event_id`,
            [eventId, guildId, userId, role.id]
        );
        if (!inserted.rowCount) {
            return res.json({ success: true, duplicate: true, message: 'La compra ya se había procesado.' });
        }
        return res.status(201).json({ success: true, roleId: role.id, message: 'Rol VIP asignado.' });
    } catch (error) {
        if (String(error.code) === '10007') {
            return res.status(404).json({ success: false, error: 'El usuario no pertenece a ese servidor.' });
        }
        console.error('Error al procesar una compra externa:', error);
        return res.status(500).json({ success: false, error: 'No se pudo procesar la compra.' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const [reviews, sanctions] = await Promise.all([
            pool.query('SELECT COUNT(*)::int AS total_reviews FROM reviews'),
            pool.query('SELECT COUNT(*)::int AS total_sanctions FROM sanctions')
        ]);
        const totalMembers = client.guilds.cache.reduce(
            (total, guild) => total + guild.memberCount,
            0
        );

        return res.json({
            success: true,
            total_servers: client.guilds.cache.size,
            total_members: totalMembers,
            total_reviews: reviews.rows[0].total_reviews,
            total_sanctions: sanctions.rows[0].total_sanctions
        });
    } catch (error) {
        console.error('Error al consultar estadísticas de la API:', error);
        return res.status(500).json({ success: false, error: 'No se pudieron consultar las estadísticas.' });
    }
});

router.post('/social/announce', async (req, res) => {
    const {
        guildId,
        title,
        message,
        url,
        image,
        platform,
        pingEveryone = false
    } = req.body || {};
    const supportedPlatforms = ['Twitch', 'YouTube', 'Kick', 'Web'];

    if (typeof guildId !== 'string' || !/^\d{1,32}$/.test(guildId)
        || typeof title !== 'string' || !title.trim() || title.length > 256
        || typeof message !== 'string' || !message.trim() || message.length > 4000
        || !supportedPlatforms.includes(platform)
        || typeof pingEveryone !== 'boolean') {
        return res.status(400).json({ success: false, error: 'La petición de anuncio tiene campos inválidos.' });
    }
    for (const [name, value] of [['url', url], ['image', image]]) {
        if (value !== undefined && value !== null) {
            try {
                if (typeof value !== 'string' || new URL(value).protocol !== 'https:') {
                    throw new Error('invalid URL');
                }
            } catch {
                return res.status(400).json({ success: false, error: `${name} debe ser una URL HTTPS válida.` });
            }
        }
    }

    try {
        const webhookSecret = process.env.SOCIAL_WEBHOOK_SECRET;
        const providedSecret = req.get('authorization')?.replace(/^Bearer\s+/i, '');
        if (!webhookSecret) {
            return res.status(503).json({ success: false, error: 'El endpoint de notificaciones no está configurado.' });
        }
        if (!providedSecret || !safeEqual(providedSecret, webhookSecret)) {
            return res.status(401).json({ success: false, error: 'Credencial de notificación no válida.' });
        }

        const { rows } = await pool.query(
            'SELECT social_channel_id FROM guild_configs WHERE guild_id = $1',
            [guildId]
        );
        if (!rows[0]?.social_channel_id) {
            return res.status(404).json({ success: false, error: 'No hay canal social configurado para este servidor.' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'El bot no está en el servidor solicitado.' });
        }
        const channel = guild.channels.cache.get(rows[0].social_channel_id)
            || await guild.channels.fetch(rows[0].social_channel_id);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') {
            return res.status(409).json({ success: false, error: 'El canal social configurado no está disponible para enviar mensajes.' });
        }

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setAuthor({ name: `MODEOS EL OBI OFFICIAL • ${platform}` })
            .setTitle(title.trim())
            .setDescription(message.trim())
            .setColor(platform === 'Twitch' ? '#9146FF' : platform === 'YouTube' ? '#FF0000' : platform === 'Kick' ? '#53FC18' : '#5865F2')
            .setTimestamp();
        if (url) embed.setURL(url);
        if (image) embed.setImage(image);

        await channel.send({
            content: pingEveryone ? '@everyone' : undefined,
            embeds: [embed],
            allowedMentions: { parse: pingEveryone ? ['everyone'] : [] }
        });
        return res.status(201).json({ success: true, message: 'Anuncio publicado.', channelId: channel.id });
    } catch (error) {
        console.error('Error al publicar anuncio social:', error);
        return res.status(500).json({ success: false, error: 'No se pudo publicar el anuncio.' });
    }
});

module.exports = router;
