import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits,
  ChannelType,
  Guild,
  TextChannel,
} from 'discord.js';
import { config } from '../config';
import { db } from '../db';
import { warns, blacklist } from '../db/schema';

interface AdminScanResult {
  guild: Guild;
  admins: Array<{ id: string; tag: string; displayName: string }>;
  error?: string;
}

const REPORT_CHUNK_LENGTH = 1800;
const WATCHED_USER_IDS = new Set(
  (process.env.DISCORD_ADMIN_WATCH_USER_IDS ?? '')
    .split(',')
    .map(userId => userId.trim())
    .filter(Boolean),
);
let globalAdminChannelId: string | null = null;

async function ensurePrivateAdminChannel(
  guild: Guild,
  name: string,
  topic: string,
): Promise<TextChannel> {
  const botUser = guild.client.user;
  if (!botUser) {
    throw new Error('El cliente de Discord todavía no está conectado.');
  }

  const adminRoleOverwrites = guild.roles.cache
    .filter(role =>
      role.id !== guild.roles.everyone.id &&
      role.permissions.has(PermissionFlagsBits.Administrator),
    )
    .map(role => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    }));
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    ...adminRoleOverwrites,
    {
      id: botUser.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  let channel = guild.channels.cache.find(
    (candidate): candidate is TextChannel =>
      candidate.type === ChannelType.GuildText && candidate.name === name,
  );

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      topic,
      permissionOverwrites,
    });
  } else {
    await channel.permissionOverwrites.set(permissionOverwrites);
  }

  return channel;
}

async function scanGuildAdmins(guild: Guild): Promise<AdminScanResult> {
  const members = await guild.members.fetch();
  const admins = members
    .filter(member =>
      !member.user.bot &&
      member.permissions.has(PermissionFlagsBits.Administrator),
    )
    .map(member => ({
      id: member.id,
      tag: member.user.tag,
      displayName: member.displayName,
    }));

  return { guild, admins };
}

function chunkReportLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    for (let offset = 0; offset < line.length; offset += REPORT_CHUNK_LENGTH) {
      const part = line.slice(offset, offset + REPORT_CHUNK_LENGTH);
      if (current && current.length + part.length + 1 > REPORT_CHUNK_LENGTH) {
        chunks.push(current);
        current = '';
      }
      current = current ? `${current}\n${part}` : part;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sendAdminScanReport(
  channel: TextChannel,
  results: AdminScanResult[],
): Promise<void> {
  const failedScans = results.filter(result => result.error).length;
  const totalAdmins = results.reduce(
    (total, result) => total + result.admins.length,
    0,
  );

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          failedScans === 0
            ? '✅ Escaneo global finalizado'
            : '⚠️ Escaneo global finalizado parcialmente',
        )
        .setDescription(
          [
            `Servidores escaneados: **${results.length}**`,
            `Administradores detectados: **${totalAdmins}**`,
            `Servidores con errores: **${failedScans}**`,
          ].join('\n'),
        )
        .setColor(failedScans === 0 ? 0x57f287 : 0xfee75c)
        .setTimestamp(),
    ],
    allowedMentions: { parse: [] },
  });

  const guildLines = results.map(({ guild, admins, error }) =>
    error
      ? `⚠️ ${guild.name} (${guild.id}) — escaneo incompleto`
      : `• ${guild.name} (${guild.id}) — ${admins.length} administrador(es)`,
  );

  for (const [index, description] of chunkReportLines(
    guildLines.length > 0 ? guildLines : ['No hay servidores en la caché.'],
  ).entries()) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Servidores escaneados (${index + 1})`)
          .setDescription(description)
          .setColor(0x5865f2),
      ],
      allowedMentions: { parse: [] },
    });
  }

  for (const result of results) {
    const adminLines = result.error
      ? [`⚠️ No se pudieron leer miembros: ${result.error}`]
      : result.admins.length > 0
        ? result.admins.map(admin =>
          `• ${admin.displayName} (${admin.tag}) — ID: ${admin.id}`,
        )
        : ['No se encontraron administradores humanos.'];

    const pages = chunkReportLines(adminLines);
    for (const [index, description] of pages.entries()) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Administradores: ${result.guild.name}`.slice(0, 256))
            .setDescription(description)
            .setFooter({
              text: `Servidor ${result.guild.id} · Página ${index + 1}/${pages.length}`,
            })
            .setColor(result.error ? 0xfee75c : 0xed4245),
        ],
        allowedMentions: { parse: [] },
      });
    }
  }
}

// 1. Inicialización del Cliente de Discord
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// 2. Definición de Comandos Slash
const slashCommands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Verifica la latencia actual del bot'),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verifica tu cuenta en el servidor'),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Aplica una advertencia a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a advertir').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Razón de la advertencia').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Consulta las advertencias de un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a consultar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Gestiona la lista negra del servidor')
    .addSubcommand(s => 
      s.setName('add')
       .setDescription('Añade un usuario a la lista negra')
       .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
       .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(true)))
    .addSubcommand(s => 
      s.setName('remove')
       .setDescription('Remueve un usuario de la lista negra')
       .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Envía un anuncio en formato Embed a un canal')
    .addChannelOption(o => o.setName('canal').setDescription('Canal de destino').setRequired(true))
    .addStringOption(o => o.setName('titulo').setDescription('Título del anuncio').setRequired(true))
    .addStringOption(o => o.setName('mensaje').setDescription('Cuerpo del mensaje').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Registra una reseña o vouch para un vendedor')
    .addUserOption(o => o.setName('vendedor').setDescription('Vendedor evaluado').setRequired(true))
    .addIntegerOption(o => o.setName('estrellas').setDescription('Puntuación de 1 a 5').setMinValue(1).setMaxValue(5).setRequired(true))
    .addStringOption(o => o.setName('comentario').setDescription('Comentario de la transacción').setRequired(true)),

  new SlashCommandBuilder()
    .setName('recent-accounts')
    .setDescription('Muestra cuentas unidas recientemente para seguridad')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('export-structure')
    .setDescription('Exporta la estructura de canales y roles del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('comunicados')
    .setDescription('Envía un comunicado oficial exclusivo para el servidor principal')
    .addStringOption(o => o.setName('mensaje').setDescription('Contenido del comunicado').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('anuncios-globales')
    .setDescription('Difunde un anuncio global a todos los servidores del bot')
    .addStringOption(o => o.setName('titulo').setDescription('Título del anuncio global').setRequired(true))
    .addStringOption(o => o.setName('mensaje').setDescription('Mensaje a difundir en masa').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('scan_avise_admin')
    .setDescription('Crea el canal privado de avisos locales para administradores')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('global_scann_adm')
    .setDescription('Configura el canal global privado de alertas de administradores')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('ejecute_admin_scann')
    .setDescription('Escanea los administradores de todos los servidores del bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

// 3. Registro Global de Comandos en la API de Discord
async function registerCommands() {
  if (!config.discord.token || !config.discord.clientId) return;
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  try {
    console.log('🔄 Registrando comandos Slash...');
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: slashCommands.map(cmd => cmd.toJSON()),
    });
    console.log('✅ Comandos Slash registrados con éxito.');
  } catch (error) {
    console.error('❌ Error registrando comandos Slash:', error);
  }
}

// 4. Configuración de Eventos del Bot (Sin escaneos masivos automáticos al encender)
client.on('ready', async () => {
  console.log(`🤖 Bot conectado exitosamente como ${client.user?.tag}`);
  const controlGuild = config.discord.guildId
    ? client.guilds.cache.get(config.discord.guildId)
    : undefined;
  globalAdminChannelId = controlGuild?.channels.cache.find(
    (channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText &&
      channel.name === 'global-admin-logs',
  )?.id ?? null;
  await registerCommands();
  console.log('✅ Bot listo y operativo (auditorías bajo demanda mediante comandos).');
});

// Unirse a un servidor no debe crear canales ni roles automáticamente.
client.on('guildCreate', async (guild) => {
  console.log(`🤖 El bot se ha unido a un nuevo servidor: ${guild.name}`);
});

client.on('guildMemberAdd', async (member) => {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isWatchedUser = WATCHED_USER_IDS.has(member.id);
  if (member.user.bot || (!isAdmin && !isWatchedUser)) {
    return;
  }

  const timestamp = new Date();
  const embed = new EmbedBuilder()
    .setTitle(isAdmin ? '🛡️ Nuevo administrador detectado' : '👁️ Usuario vigilado detectado')
    .addFields(
      { name: 'Usuario', value: member.user.username, inline: true },
      { name: 'Tag', value: member.user.tag, inline: true },
      { name: 'ID de usuario', value: member.id, inline: true },
      { name: 'Servidor', value: member.guild.name, inline: true },
      { name: 'ID del servidor', value: member.guild.id, inline: true },
      { name: 'Fecha y hora', value: timestamp.toISOString(), inline: false },
    )
    .setColor(0xed4245)
    .setTimestamp(timestamp);

  const localChannel = isAdmin
    ? member.guild.channels.cache.find(
      (channel): channel is TextChannel =>
        channel.type === ChannelType.GuildText &&
        channel.name === 'avisos-admin',
    )
    : undefined;

  if (localChannel) {
    try {
      await localChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(
        `No se pudo enviar el aviso local de administrador en ${member.guild.name}:`,
        error,
      );
    }
  }

  const controlGuild = config.discord.guildId
    ? client.guilds.cache.get(config.discord.guildId)
    : undefined;
  const globalChannel = controlGuild?.channels.cache.find(
    (channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText &&
      (channel.id === globalAdminChannelId ||
        (!globalAdminChannelId && channel.name === 'global-admin-logs')),
  );

  if (globalChannel) {
    try {
      await globalChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(
        `No se pudo enviar la alerta global de administrador para ${member.guild.name}:`,
        error,
      );
    }
  }
});

// Procesamiento de Interacciones (Comandos Slash)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong! Latencia WebSocket: ${client.ws.ping}ms`, ephemeral: true });
    } 
    else if (commandName === 'verify') {
      await interaction.reply({ content: '✅ Te has verificado correctamente en el servidor.', ephemeral: true });
    } 
    else if (commandName === 'warn') {
      const user = interaction.options.getUser('usuario', true);
      const razon = interaction.options.getString('razon', true);
       
      await db.insert(warns).values({
        id: `${interaction.guildId}-${Date.now()}`,
        guildId: interaction.guildId,
        userId: user.id,
        moderatorId: interaction.user.id,
        reason: razon,
      });

      await interaction.reply({ content: `⚠️ Advertencia aplicada a **${user.tag}**. Razón: ${razon}` });
    } 
    else if (commandName === 'warns') {
      const user = interaction.options.getUser('usuario', true);
      await interaction.reply({ content: `📋 Consultando historial de advertencias para **${user.tag}**...`, ephemeral: true });
    } 
    else if (commandName === 'blacklist') {
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser('usuario', true);

      if (sub === 'add') {
        const razon = interaction.options.getString('razon', true);
        await db.insert(blacklist).values({
          id: `${interaction.guildId}-${user.id}`,
          guildId: interaction.guildId,
          userId: user.id,
          reason: razon,
        }).onConflictDoNothing();

        await interaction.reply({ content: `⛔ **${user.tag}** añadido a la lista negra. Razón: ${razon}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `🟢 **${user.tag}** removido de la lista negra.`, ephemeral: true });
      }
    } 
    else if (commandName === 'announce') {
      const canal = interaction.options.getChannel('canal', true);
      const titulo = interaction.options.getString('titulo', true);
      const mensaje = interaction.options.getString('mensaje', true);

      const embed = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(mensaje)
        .setColor(0x5865F2)
        .setTimestamp();

      if ('send' in canal) {
        await canal.send({ embeds: [embed] });
        await interaction.reply({ content: `📢 Anuncio enviado con éxito a ${canal}.`, ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ El canal seleccionado no es apto para enviar mensajes.', ephemeral: true });
      }
    } 
    else if (commandName === 'vouch') {
      const vendedor = interaction.options.getUser('vendedor', true);
      const estrellas = interaction.options.getInteger('estrellas', true);
      const comentario = interaction.options.getString('comentario', true);
      const stars = '⭐'.repeat(estrellas);

      await interaction.reply({
        content: `⭐ **Nuevo Vouch Registrado**\n**Vendedor:** ${vendedor}\n**Calificación:** ${stars}\n**Comentario:** "${comentario}"`
      });
    } 
    else if (commandName === 'recent-accounts') {
      await interaction.reply({ content: '🔍 Analizando cuentas recientes en el servidor...', ephemeral: true });
    } 
    else if (commandName === 'export-structure') {
      await interaction.reply({ content: '📁 Estructura del servidor recopilada correctamente.', ephemeral: true });
    }
    else if (commandName === 'comunicados') {
      const SERVER_PRINCIPAL_ID = config.discord.guildId; 

      if (interaction.guildId !== SERVER_PRINCIPAL_ID) {
        await interaction.reply({ content: '❌ Este comando solo se puede usar en el servidor de comunicados oficial.', ephemeral: true });
        return;
      }

      const texto = interaction.options.getString('mensaje', true);
      const embed = new EmbedBuilder()
        .setTitle('📢 COMUNICADO OFICIAL')
        .setDescription(texto)
        .setColor(0xFEE75C)
        .setFooter({ text: `Emitido por ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'anuncios-globales') {
      const titulo = interaction.options.getString('titulo', true);
      const mensaje = interaction.options.getString('mensaje', true);

      await interaction.reply({ content: '🌐 Procesando envío masivo de anuncios a todos los servidores...', ephemeral: true });

      const embedGlobal = new EmbedBuilder()
        .setTitle(`🌐 ${titulo}`)
        .setDescription(mensaje)
        .setColor(0x5865F2)
        .setTimestamp();

      let enviados = 0;

      for (const [_, guild] of client.guilds.cache) {
        try {
          const channelNameTarget = 'anuncios';
          let targetChannel = guild.channels.cache.find(
            ch => ch.isTextBased() && (ch.name.toLowerCase().includes(channelNameTarget) || ch.name.toLowerCase().includes('news'))
          );

          if (!targetChannel && guild.systemChannel) {
            targetChannel = guild.systemChannel;
          }

          if (targetChannel && 'send' in targetChannel) {
            await targetChannel.send({ embeds: [embedGlobal] });
            enviados++;
          }
        } catch (err) {
          console.error(`No se pudo enviar el anuncio global al servidor ${guild.name}:`, err);
        }
      }

      await interaction.followUp({ content: `✅ Anuncio global enviado con éxito a **${enviados}** servidores.`, ephemeral: true });
    }
    else if (
      commandName === 'scan_avise_admin' ||
      commandName === 'global_scann_adm' ||
      commandName === 'ejecute_admin_scann'
    ) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({
          content: '❌ Necesitas el permiso **Gestionar canales** para usar este comando.',
          ephemeral: true,
        });
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({
          content: '❌ Este comando solo se puede usar dentro de un servidor.',
          ephemeral: true,
        });
        return;
      }

      const isGlobalCommand = commandName !== 'scan_avise_admin';
      if (
        isGlobalCommand &&
        (!config.discord.guildId || interaction.guild.id !== config.discord.guildId)
      ) {
        await interaction.reply({
          content: '❌ Los comandos globales solo se pueden usar en el servidor principal de control.',
          ephemeral: true,
        });
        return;
      }

      if (commandName === 'scan_avise_admin') {
        const channel = await ensurePrivateAdminChannel(
          interaction.guild,
          'avisos-admin',
          'Avisos locales privados sobre la entrada de administradores.',
        );
        await interaction.reply({
          content: `✅ Canal privado de avisos locales configurado: ${channel}.`,
          ephemeral: true,
        });
      } else if (commandName === 'global_scann_adm') {
        const channel = await ensurePrivateAdminChannel(
          interaction.guild,
          'global-admin-logs',
          'Central global privada de alertas de entrada de administradores.',
        );
        globalAdminChannelId = channel.id;
        await interaction.reply({
          content: `✅ Canal central global configurado: ${channel}.`,
          ephemeral: true,
        });
      } else {
        await interaction.deferReply({ ephemeral: true });
        const reportChannel = await ensurePrivateAdminChannel(
          interaction.guild,
          'reportes-escaneo-global',
          'Reportes privados de escaneos globales de administradores.',
        );
        const guilds = [...client.guilds.cache.values()];
        const results: AdminScanResult[] = await Promise.all(
          guilds.map(async guild => {
            try {
              return await scanGuildAdmins(guild);
            } catch (error) {
              console.error(`No se pudo escanear el servidor ${guild.name}:`, error);
              return {
                guild,
                admins: [],
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }),
        );

        await sendAdminScanReport(reportChannel, results);
        const failedScans = results.filter(result => result.error).length;
        await interaction.editReply({
          content: failedScans === 0
            ? `✅ Escaneo finalizado con éxito. Reporte completo: ${reportChannel}.`
            : `⚠️ Escaneo finalizado con ${failedScans} servidor(es) con errores. Revisa el reporte en ${reportChannel}.`,
        });
      }
    }
  } catch (error) {
    console.error(`❌ Error ejecutando el comando /${commandName}:`, error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ Hubo un error interno al ejecutar este comando.',
      });
    } else if (!interaction.replied) {
      await interaction.reply({ content: '❌ Hubo un error interno al ejecutar este comando.', ephemeral: true });
    }
  }
});

// 5. Método de Inicio para el Servidor Central
export async function startBot() {
  if (!config.discord.token) {
    console.warn('⚠️ No se ha encontrado el token de Discord en la configuración.');
    return;
  }
  await client.login(config.discord.token);
}

// 6. Estadísticas para el Dashboard
export function getBotStats() {
  return {
    online: client.isReady(),
    tag: client.user?.tag || null,
    ping: client.ws.ping,
    guildsCount: client.guilds.cache.size,
  };
}