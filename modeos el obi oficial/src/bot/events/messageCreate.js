const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { sendLog } = require('./messageLogUtils');

const invitePattern = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/gi;
const phishingPattern = /\b(free\s*n(?:itro|itros)|discord\s*gift|claim\s*your\s*gift|steamcommunity\.com\.gift)\b/i;
const messageActivity = new Map();
const SPAM_WINDOW_MS = 8_000;
const SPAM_MESSAGE_LIMIT = 6;

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild || message.author.bot || !message.member) return;
        if (message.member.permissions.has(PermissionFlagsBits.Administrator)
            || message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const allowedCodes = new Set(
            (process.env.ALLOWED_INVITE_CODES || '')
                .split(',')
                .map(code => code.trim().toLowerCase())
                .filter(Boolean)
        );
        const invites = [...message.content.matchAll(invitePattern)];
        const hasUnauthorizedInvite = invites.some(match =>
            !allowedCodes.has(match[1].toLowerCase())
        );
        const suspicious = phishingPattern.test(message.content);
        const now = Date.now();
        const activityKey = `${message.guild.id}:${message.author.id}`;
        const activity = messageActivity.get(activityKey) || {
            timestamps: [],
            lastContent: '',
            duplicateCount: 0
        };
        activity.timestamps = activity.timestamps.filter(timestamp => now - timestamp < SPAM_WINDOW_MS);
        if (!activity.timestamps.length) activity.duplicateCount = 0;
        activity.timestamps.push(now);
        activity.duplicateCount = message.content === activity.lastContent
            ? activity.duplicateCount + 1
            : 1;
        activity.lastContent = message.content;
        messageActivity.set(activityKey, activity);

        const isSpam = activity.timestamps.length > SPAM_MESSAGE_LIMIT
            || activity.duplicateCount >= 3;
        if (!hasUnauthorizedInvite && !suspicious && !isSpam) {
            if (messageActivity.size > 5000) {
                for (const [key, recent] of messageActivity) {
                    if (!recent.timestamps.some(timestamp => now - timestamp < SPAM_WINDOW_MS)) {
                        messageActivity.delete(key);
                    }
                }
            }
            return;
        }

        try {
            await message.delete();
            const reason = suspicious
                ? 'posible phishing'
                : hasUnauthorizedInvite
                    ? 'invitación de Discord no autorizada'
                    : 'spam (ráfaga de mensajes o contenido repetido)';
            const embed = new EmbedBuilder()
                .setTitle('🚨 Filtro de seguridad')
                .setColor('#E74C3C')
                .setDescription(`Se eliminó un mensaje de <@${message.author.id}> por ${reason}.`)
                .addFields({
                    name: 'Contenido eliminado',
                    value: message.content.slice(0, 1024) || '(sin texto)'
                })
                .setTimestamp();
            await sendLog(message.guild, message.client, embed);
        } catch (error) {
            console.error(`Error al gestionar mensaje sospechoso ${message.id}:`, error);
        }
    }
};
