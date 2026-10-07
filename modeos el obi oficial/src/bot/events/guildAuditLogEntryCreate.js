const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../../config/database');

const WINDOW_MS = 10_000;
const actionCategories = new Map([
    [AuditLogEvent.ChannelCreate, 'channels'],
    [AuditLogEvent.ChannelDelete, 'channels'],
    [AuditLogEvent.RoleCreate, 'roles'],
    [AuditLogEvent.RoleDelete, 'roles'],
    [AuditLogEvent.MemberBanAdd, 'bans']
]);
const recentActions = new Map();
const mitigatedActors = new Map();

function getLimit(category) {
    const configured = Number.parseInt(process.env[`ANTI_NUKE_${category.toUpperCase()}_LIMIT`], 10);
    return Number.isInteger(configured) && configured > 0 ? configured : 3;
}

module.exports = {
    name: 'guildAuditLogEntryCreate',
    async execute(entry, guild) {
        const category = actionCategories.get(entry.action);
        const actorId = entry.executorId || entry.executor?.id;
        if (!category || !actorId || actorId === guild.client.user?.id) return;

        const now = Date.now();
        if (recentActions.size > 1000) {
            for (const [key, timestamps] of recentActions) {
                if (now - timestamps.at(-1) >= WINDOW_MS) recentActions.delete(key);
            }
        }
        if (mitigatedActors.size > 1000) {
            for (const [key, timestamp] of mitigatedActors) {
                if (now - timestamp >= WINDOW_MS) mitigatedActors.delete(key);
            }
        }
        const actorKey = `${guild.id}:${actorId}`;
        const actionKey = `${actorKey}:${category}`;
        const timestamps = (recentActions.get(actionKey) || [])
            .filter(timestamp => now - timestamp < WINDOW_MS);
        timestamps.push(now);
        recentActions.set(actionKey, timestamps);
        if (timestamps.length < getLimit(category)) return;

        const lastMitigation = mitigatedActors.get(actorKey) || 0;
        if (now - lastMitigation < WINDOW_MS) return;
        mitigatedActors.set(actorKey, now);

        const executor = entry.executor
            || await guild.client.users.fetch(actorId).catch(() => null);
        let member = null;
        let removedRoles = [];
        let mitigationError = null;

        try {
            member = await guild.members.fetch(actorId);
            const botMember = guild.members.me;
            if (actorId === guild.ownerId) {
                mitigationError = 'El autor es propietario del servidor y no puede ser sancionado por el bot.';
            } else if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
                mitigationError = 'El bot no tiene permiso para gestionar roles.';
            } else {
                const rolesToRemove = member.roles.cache.filter(role =>
                    role.id !== guild.id
                    && !role.managed
                    && role.position < botMember.roles.highest.position
                );
                removedRoles = rolesToRemove.map(role => role.id);
                if (rolesToRemove.size) {
                    await member.roles.remove(removedRoles, 'Protección anti-nuke: actividad masiva detectada');
                } else {
                    mitigationError = 'No hay roles que el bot pueda retirar.';
                }
            }
        } catch (error) {
            mitigationError = error.message;
            console.error(`No se pudieron retirar los roles de ${actorId} en ${guild.id}:`, error);
        }

        const details = {
            category,
            action: entry.action,
            actionCount: timestamps.length,
            windowMs: WINDOW_MS,
            removedRoleIds: removedRoles,
            mitigationError
        };

        try {
            await pool.query(
                `INSERT INTO access_logs (source, action_type, guild_id, user_id, user_tag, details)
                 VALUES ('BOT', 'ANTI_NUKE', $1, $2, $3, $4)`,
                [guild.id, actorId, executor?.tag?.slice(0, 100) || null, JSON.stringify(details)]
            );
        } catch (error) {
            console.error(`No se pudo guardar la alerta anti-nuke de ${actorId} en ${guild.id}:`, error);
        }
    }
};