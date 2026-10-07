const express = require('express');
const crypto = require('node:crypto');
const { PermissionFlagsBits } = require('discord.js');

const router = express.Router();
const DEFAULT_FRONTEND_URL = 'https://web-modeos-el-obi.onrender.com';
const COOKIE_NAME = 'modeos_session';
const STATE_COOKIE = 'modeos_oauth_state';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function cookieOptions(
    maxAge,
    sameSite = process.env.COOKIE_SAME_SITE
        || (process.env.NODE_ENV === 'production' ? 'None' : 'Lax')
) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || sameSite.toLowerCase() === 'none',
        sameSite,
        maxAge,
        path: '/'
    };
}

function sign(value) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET no está configurado.');
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readCookies(req) {
    const cookies = {};
    for (const cookie of (req.headers.cookie || '').split(';')) {
        const trimmed = cookie.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf('=');
        try {
            cookies[trimmed.slice(0, separator)] = decodeURIComponent(trimmed.slice(separator + 1));
        } catch {
            return {};
        }
    }
    return cookies;
}

function createSession(userId) {
    const payload = Buffer.from(JSON.stringify({
        userId,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
}

function getSession(req) {
    const token = readCookies(req)[COOKIE_NAME];
    if (!token) return null;
    const [payload, signature, ...extra] = token.split('.');
    if (!payload || !signature || extra.length || !safeEqual(signature, sign(payload))) return null;

    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof session.userId !== 'string' || session.exp <= Date.now() / 1000) return null;
        return session;
    } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw error;
    }
}

function requireAuth(req, res, next) {
    try {
        const session = getSession(req);
        if (!session) {
            return res.status(401).json({ success: false, error: 'Debes iniciar sesión con Discord.' });
        }
        req.authUser = { id: session.userId };
        return next();
    } catch (error) {
        console.error('Error al validar la sesión OAuth:', error);
        return res.status(500).json({ success: false, error: 'No se pudo validar la sesión.' });
    }
}

function requireFrontendOrigin(req, res, next) {
    const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
    const origin = req.get('origin');
    if (!origin) {
        return res.status(403).json({ success: false, error: 'El origen del panel no está autorizado.' });
    }
    try {
        if (new URL(origin).origin !== new URL(frontendUrl).origin) {
            return res.status(403).json({ success: false, error: 'El origen del panel no está autorizado.' });
        }
        return next();
    } catch (error) {
        console.error('FRONTEND_URL u Origin no es una URL válida:', error);
        return res.status(500).json({ success: false, error: 'La configuración de origen no es válida.' });
    }
}

async function requireGuildAdministrator(req, res, next) {
    try {
        if (!req.authUser) {
            return res.status(401).json({ success: false, error: 'Debes iniciar sesión con Discord.' });
        }
        const guild = req.app.locals.discordClient?.guilds.cache.get(req.params.guildId);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'El bot no está en ese servidor.' });
        }
        const member = await guild.members.fetch(req.authUser.id);
        if (!member.permissions.has(PermissionFlagsBits.Administrator)
            && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return res.status(403).json({ success: false, error: 'Se requieren permisos de administrador del servidor.' });
        }
        req.guild = guild;
        return next();
    } catch (error) {
        if (['10007', '10013'].includes(String(error.code))) {
            return res.status(403).json({ success: false, error: 'No perteneces a ese servidor.' });
        }
        console.error('Error al autorizar acceso al servidor:', error);
        return res.status(500).json({ success: false, error: 'No se pudo comprobar el acceso al servidor.' });
    }
}

router.get('/login', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (!clientId || !redirectUri) {
        return res.status(503).json({ success: false, error: 'OAuth de Discord no está configurado.' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    res.cookie(STATE_COOKIE, state, cookieOptions(10 * 60 * 1000));
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify',
        state
    });
    return res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = readCookies(req)[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieOptions(0));

    if (typeof code !== 'string' || typeof state !== 'string'
        || !storedState || !safeEqual(state, storedState)) {
        return res.status(400).json({ success: false, error: 'Respuesta OAuth inválida.' });
    }

    const {
        DISCORD_CLIENT_SECRET,
        DISCORD_REDIRECT_URI,
    } = process.env;
    const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
    if (!clientId || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI || !process.env.SESSION_SECRET) {
        return res.status(503).json({ success: false, error: 'OAuth de Discord no está configurado completamente.' });
    }

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: DISCORD_REDIRECT_URI
            })
        });
        if (!tokenResponse.ok) {
            console.error('Discord OAuth token exchange failed:', tokenResponse.status);
            return res.status(502).json({ success: false, error: 'Discord no pudo completar la autenticación.' });
        }

        const token = await tokenResponse.json();
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${token.access_token}` }
        });
        if (!userResponse.ok) {
            console.error('Discord OAuth user lookup failed:', userResponse.status);
            return res.status(502).json({ success: false, error: 'No se pudo obtener el usuario de Discord.' });
        }
        const user = await userResponse.json();
        res.cookie(COOKIE_NAME, createSession(user.id), cookieOptions(SESSION_TTL_SECONDS * 1000));
        return res.redirect(process.env.OAUTH_SUCCESS_REDIRECT || frontendUrl);
    } catch (error) {
        console.error('Error durante el callback OAuth de Discord:', error);
        return res.status(500).json({ success: false, error: 'No se pudo completar el inicio de sesión.' });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await req.app.locals.discordClient.users.fetch(req.authUser.id);
        return res.json({
            success: true,
            user: { id: user.id, username: user.username, avatar: user.displayAvatarURL() }
        });
    } catch (error) {
        console.error('Error al obtener el usuario de la sesión:', error);
        return res.status(502).json({ success: false, error: 'No se pudo consultar el usuario de Discord.' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions(0));
    return res.json({ success: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireFrontendOrigin = requireFrontendOrigin;
module.exports.requireGuildAdministrator = requireGuildAdministrator;
module.exports.safeEqual = safeEqual;
