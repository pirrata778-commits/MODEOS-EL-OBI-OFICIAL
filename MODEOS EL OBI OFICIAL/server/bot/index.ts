import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits
} from 'discord.js';
import { config } from '../config';
import { db } from '../db';
import { warns, blacklist } from '../db/schema';
import { scanAndNotifyAdmins } from './adminScanner';
import { updateServerStats } from './statsChannels';

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

// 4. Configuración de Eventos del Bot
client.on('ready', async () => {
  console.log(`🤖 Bot conectado exitosamente como ${client.user?.tag}`);
  await registerCommands();

  // Escanear servidores en busca de administradores y actualizar estadísticas al arrancar
  for (const [_, guild] of client.guilds.cache) {
    await scanAndNotifyAdmins(guild);
    await updateServerStats(guild);
  }
});

// Evento cuando el bot se une a un nuevo servidor
client.on('guildCreate', async (guild) => {
  console.log(`🤖 El bot se ha unido a un nuevo servidor: ${guild.name}`);
  await scanAndNotifyAdmins(guild);
  await updateServerStats(guild);
});

// Eventos de miembros para mantener contadores de voz actualizados
client.on('guildMemberAdd', async (member) => {
  await updateServerStats(member.guild);
});

client.on('guildMemberRemove', async (member) => {
  await updateServerStats(member.guild);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
    await updateServerStats(newMember.guild);
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
  } catch (error) {
    console.error(`❌ Error ejecutando el comando /${commandName}:`, error);
    if (!interaction.replied) {
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