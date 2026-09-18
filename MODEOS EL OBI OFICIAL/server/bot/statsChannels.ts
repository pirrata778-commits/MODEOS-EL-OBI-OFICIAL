import { Guild, ChannelType, PermissionFlagsBits, VoiceChannel } from 'discord.js';

export async function updateServerStats(guild: Guild) {
  try {
    // 1. Asegurar que los miembros del servidor están cacheados de forma segura
    await guild.members.fetch({ time: 60000 }).catch(err => {
      console.warn(`⚠️ No se pudieron descargar todos los miembros para estadísticas en ${guild.name}, usando caché disponible:`, err.message);
    });

    // 2. Calcular las métricas exactas
    const totalMembers = guild.memberCount;
    const botsCount = guild.members.cache.filter(m => m.user.bot).size;
    const usersCount = totalMembers - botsCount;
    const adminsCount = guild.members.cache.filter(
      m => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator)
    ).size;

    const categoryName = '📊 ESTADÍSTICAS DEL SERVIDOR';
    const channelsData = [
      { name: `🤖 Bots: ${botsCount}`, type: ChannelType.GuildVoice },
      { name: `👥 Usuarios: ${usersCount}`, type: ChannelType.GuildVoice },
      { name: `🛡️ Admins: ${adminsCount}`, type: ChannelType.GuildVoice },
      { name: `📈 Total: ${totalMembers}`, type: ChannelType.GuildVoice },
    ];

    // 3. Buscar o crear la categoría de estadísticas
    let category = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name.toUpperCase().includes('ESTADÍSTICAS')
    );

    if (!category) {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.Connect], // Bloquear conexión para que funcionen solo como contadores visuales
          },
        ],
      });
    }

    // 4. Crear o actualizar los canales de voz dentro de la categoría
    for (const data of channelsData) {
      let channel = guild.channels.cache.find(
        ch => ch.parentId === category?.id && ch.name.startsWith(data.name.split(':')[0])
      ) as VoiceChannel;

      if (channel) {
        // Actualizar el nombre solo si el número ha cambiado
        if (channel.name !== data.name) {
          await channel.setName(data.name);
        }
      } else {
        // Crear el canal de voz si todavía no existe
        await guild.channels.create({
          name: data.name,
          type: ChannelType.GuildVoice,
          parent: category.id,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.Connect],
            },
          ],
        });
      }
    }
  } catch (error) {
    console.error(`❌ Error al actualizar los canales de estadísticas en el servidor ${guild.name}:`, error);
  }
}
