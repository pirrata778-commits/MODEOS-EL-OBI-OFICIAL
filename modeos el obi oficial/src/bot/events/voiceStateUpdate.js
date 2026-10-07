const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const guild = newState.guild || oldState.guild;

        try {
            if (oldState.channelId) {
                const tracked = await pool.query(
                    'SELECT channel_id FROM temporary_voice_channels WHERE channel_id = $1 AND guild_id = $2',
                    [oldState.channelId, guild.id]
                );
                if (tracked.rowCount) {
                    const oldChannel = oldState.channel
                        || await guild.channels.fetch(oldState.channelId);
                    if (oldChannel && oldChannel.members.size === 0) {
                        await oldChannel.delete('Temporal voice room is empty');
                    }
                    if (!oldChannel || oldChannel.members.size === 0) {
                        await pool.query(
                            'DELETE FROM temporary_voice_channels WHERE channel_id = $1',
                            [oldState.channelId]
                        );
                    }
                }
            }

            if (!newState.channelId) return;
            const { rows } = await pool.query(
                'SELECT voice_generator_channel_id FROM guild_configs WHERE guild_id = $1',
                [guild.id]
            );
            const generatorId = rows[0]?.voice_generator_channel_id;
            if (!generatorId || newState.channelId !== generatorId) return;

            const member = newState.member;
            const generator = newState.channel;
            if (!member || !generator) return;

            const room = await guild.channels.create({
                name: `🔊 ${member.user.username}`.slice(0, 100),
                type: ChannelType.GuildVoice,
                parent: generator.parentId || undefined,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.Connect]
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak,
                            PermissionFlagsBits.Stream
                        ]
                    }
                ],
                reason: `Canal de voz temporal de ${member.user.tag}`
            });

            try {
                await pool.query(
                    `INSERT INTO temporary_voice_channels (channel_id, guild_id, owner_id)
                     VALUES ($1, $2, $3)`,
                    [room.id, guild.id, member.id]
                );
                await member.voice.setChannel(room, 'Canal temporal creado desde el generador');
            } catch (error) {
                try {
                    await pool.query(
                        'DELETE FROM temporary_voice_channels WHERE channel_id = $1',
                        [room.id]
                    );
                    await room.delete('No se pudo mover al miembro al canal temporal');
                } catch (cleanupError) {
                    console.error(`No se pudo limpiar el canal de voz ${room.id}:`, cleanupError);
                }
                throw error;
            }
        } catch (error) {
            console.error(`Error al gestionar canal de voz temporal en ${guild.id}:`, error);
        }
    }
};
