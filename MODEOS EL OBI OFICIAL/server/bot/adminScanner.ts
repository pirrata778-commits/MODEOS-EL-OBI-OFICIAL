import { Guild, EmbedBuilder, TextChannel } from 'discord.js';
import { db } from '../db';
import { detectedAdmins } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function scanAndNotifyAdmins(guild: Guild) {
  try {
    console.log(`🔍 Escaneando administradores en el servidor: ${guild.name}...`);
    
    // 1. Asegurar que los miembros del servidor están cacheados
    await guild.members.fetch();

    // 2. Filtrar miembros que no sean bots y tengan permisos de Administrador
    const adminMembers = guild.members.cache.filter(
      member => !member.user.bot && member.permissions.has('Administrator')
    );

    const adminsList: { userId: string; userTag: string; roles: string }[] = [];

    for (const [_, member] of adminMembers) {
      const userTag = member.user.tag;
      const userId = member.id;
      // Obtener los nombres de los roles del usuario (excluyendo @everyone)
      const roles = member.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => r.name)
        .join(', ');

      adminsList.push({ userId, userTag, roles });

      // 3. Registrar o actualizar en la base de datos
      await db.insert(detectedAdmins).values({
        id: `${guild.id}-${userId}`,
        guildId: guild.id,
        userId: userId,
        userTag: userTag,
        roles: roles || 'Sin roles específicos',
      }).onConflictDoUpdate({
        target: detectedAdmins.id,
        set: {
          userTag: userTag,
          roles: roles || 'Sin roles específicos',
        },
      });
    }

    // 4. Buscar o crear el canal de texto para las notificaciones
    const channelName = '『𝒂𝒅𝒎𝒊𝒏-𝚍𝚎𝚝𝚎𝚌𝚝𝚊𝚍𝚘-⚠️』';
    let targetChannel = guild.channels.cache.find(
      ch => ch.isTextBased() && ch.name.toLowerCase().includes('admin-detectado')
    ) as TextChannel;

    if (!targetChannel) {
      try {
        targetChannel = await guild.channels.create({
          name: channelName,
          topic: 'Canal de auditoría automática de administradores detectados.',
        });
      } catch (err) {
        console.error(`❌ No se pudo crear el canal de alerta de admins en ${guild.name}:`, err);
        return;
      }
    }

    // 5. Construir y enviar el Embed con los resultados del escaneo
    const fields = adminsList.slice(0, 25).map(admin => ({
      name: `👤 ${admin.userTag}`,
      value: `**ID:** \`${admin.userId}\`\n**Roles:** ${admin.roles}`,
      inline: false,
    }));

    const embed = new EmbedBuilder()
      .setTitle('⚠️ AUDITORÍA: ADMINISTRADORES DETECTADOS')
      .setDescription(`Se ha completado el escaneo de seguridad. Total de administradores encontrados: **${adminsList.length}**`)
      .addFields(fields.length > 0 ? fields : [{ name: 'Estado', value: 'No se encontraron administradores externos.', inline: false }])
      .setColor(0xED4245)
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });
    console.log(`✅ Escaneo de administradores finalizado para ${guild.name}.`);

  } catch (error) {
    console.error(`❌ Error al ejecutar el escaneo de administradores en ${guild.name}:`, error);
  }
}
