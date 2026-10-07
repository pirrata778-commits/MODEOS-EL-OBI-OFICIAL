const { PermissionFlagsBits } = require('discord.js');

const restrictedPermissions = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.ManageThreads
];

function hasRestrictedPermissions(role) {
    return role.permissions.any(restrictedPermissions);
}

module.exports = { hasRestrictedPermissions };
