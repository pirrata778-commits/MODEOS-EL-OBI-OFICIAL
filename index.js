const { createServer } = require('node:http');
const ffmpegPath = require('ffmpeg-static');

if (!ffmpegPath) {
  throw new Error('No se encontró el binario FFmpeg proporcionado por ffmpeg-static.');
}
process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegPath;

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require('discord.js');
const { Player } = require('discord-player');
const {
  AppleMusicExtractor,
  ReverbnationExtractor,
  SoundCloudExtractor,
  SpotifyExtractor,
  VimeoExtractor,
  YoutubeExtractor,
} = require('@discord-player/extractor');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN) {
  throw new Error('Falta la variable de entorno TOKEN.');
}
if (!CLIENT_ID) {
  throw new Error('Falta la variable de entorno CLIENT_ID.');
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`El puerto configurado no es válido: ${process.env.PORT}`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});
const player = new Player(client);
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      status: 'ok',
      discordReady: client.isReady(),
    }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una canción o playlist')
    .addStringOption(option =>
      option.setName('busqueda')
        .setDescription('Nombre o enlace de la canción/playlist')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Conecta el bot a tu canal de voz actual'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Desconecta el bot del canal de voz'),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta a la siguiente canción'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta el volumen del bot (0 a 100)')
    .addIntegerOption(option =>
      option.setName('nivel')
        .setDescription('Nivel de volumen (0-100)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    ),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la música'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la música'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y limpia la cola'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra la lista de canciones en cola'),
].map(command => command.toJSON());

function withTimeout(promise, milliseconds, operation) {
  let timeout;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${operation} excedió el tiempo límite de ${milliseconds / 1000} segundos.`));
    }, milliseconds);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function createOrGetQueue(guild, channel) {
  return player.nodes.get(guild.id) || player.nodes.create(guild, {
    metadata: { channel },
    selfDeaf: true,
    volume: 80,
  });
}

async function sendInteractionError(interaction, message) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  } catch (error) {
    console.error('No se pudo informar del error de la interacción:', error);
  }
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Este comando solo está disponible dentro de un servidor.',
      ephemeral: true,
    });
    return;
  }

  const { commandName, guild, channel } = interaction;
  const voiceChannel = interaction.member?.voice?.channel;

  if (['play', 'join'].includes(commandName) && !voiceChannel) {
    await interaction.reply({
      content: '❌ Debes estar en un canal de voz para usar este comando.',
      ephemeral: true,
    });
    return;
  }

  switch (commandName) {
    case 'join': {
      const queue = createOrGetQueue(guild, channel);
      try {
        if (!queue.connection) {
          await withTimeout(queue.connect(voiceChannel), 20_000, 'La conexión al canal de voz');
        }
        await interaction.reply(`🔊 Conectado al canal de voz **${voiceChannel.name}**.`);
      } catch (error) {
        if (!queue.isPlaying() && queue.tracks.size === 0) queue.delete();
        throw error;
      }
      return;
    }

    case 'leave': {
      const queue = player.nodes.get(guild.id);
      if (queue) {
        queue.delete();
        await interaction.reply('👋 Desconectado del canal de voz.');
      } else if (guild.members.me?.voice.channel) {
        guild.members.me.voice.disconnect();
        await interaction.reply('👋 Desconectado del canal de voz.');
      } else {
        await interaction.reply({
          content: '❌ El bot no está en ningún canal de voz.',
          ephemeral: true,
        });
      }
      return;
    }

    case 'play': {
      await interaction.deferReply();
      const query = interaction.options.getString('busqueda', true);
      const result = await withTimeout(
        player.search(query, { requestedBy: interaction.user }),
        30_000,
        'La búsqueda de música'
      );

      if (!result.hasTracks()) {
        await interaction.followUp('❌ No se encontraron resultados.');
        return;
      }

      const existingQueue = player.nodes.get(guild.id);
      const queue = createOrGetQueue(guild, channel);
      try {
        if (!queue.connection) {
          await withTimeout(queue.connect(voiceChannel), 20_000, 'La conexión al canal de voz');
        }
      } catch (error) {
        if (!existingQueue && !queue.isPlaying() && queue.tracks.size === 0) queue.delete();
        throw error;
      }

      if (result.playlist) {
        queue.addTrack(result.tracks);
        await interaction.followUp(
          `✅ Playlist añadida: **${result.playlist.title}** (${result.tracks.length} canciones)`
        );
      } else {
        queue.addTrack(result.tracks[0]);
        await interaction.followUp(`➕ Añadida a la cola: **${result.tracks[0].title}**`);
      }

      if (!queue.isPlaying()) await queue.node.play();
      return;
    }

    case 'skip': {
      const queue = player.nodes.get(guild.id);
      if (!queue?.isPlaying() || !queue.currentTrack) {
        await interaction.reply({
          content: '❌ No hay ninguna canción sonando para saltar.',
          ephemeral: true,
        });
        return;
      }
      const currentTrack = queue.currentTrack;
      queue.node.skip();
      await interaction.reply(`⏭️ Se ha saltado la canción: **${currentTrack.title}**`);
      return;
    }

    case 'volume': {
      const queue = player.nodes.get(guild.id);
      if (!queue?.currentTrack) {
        await interaction.reply({
          content: '❌ No hay reproducción activa para cambiar el volumen.',
          ephemeral: true,
        });
        return;
      }
      const newVolume = interaction.options.getInteger('nivel', true);
      queue.node.setVolume(newVolume);
      await interaction.reply(`🔊 Volumen ajustado a: **${newVolume}%**`);
      return;
    }

    case 'pause': {
      const queue = player.nodes.get(guild.id);
      if (!queue?.currentTrack) {
        await interaction.reply({ content: '❌ No hay nada sonando.', ephemeral: true });
        return;
      }
      queue.node.pause();
      await interaction.reply('⏸️ Música pausada.');
      return;
    }

    case 'resume': {
      const queue = player.nodes.get(guild.id);
      if (!queue?.currentTrack) {
        await interaction.reply({ content: '❌ No hay música para reanudar.', ephemeral: true });
        return;
      }
      queue.node.resume();
      await interaction.reply('▶️ Música reanudada.');
      return;
    }

    case 'stop': {
      const queue = player.nodes.get(guild.id);
      if (!queue) {
        await interaction.reply({
          content: '❌ El bot no está en un canal reproduciendo música.',
          ephemeral: true,
        });
        return;
      }
      queue.delete();
      await interaction.reply('🛑 Reproducción detenida y lista borrada.');
      return;
    }

    case 'queue': {
      const queue = player.nodes.get(guild.id);
      if (!queue?.currentTrack) {
        await interaction.reply({ content: '❌ La lista de reproducción está vacía.', ephemeral: true });
        return;
      }

      const currentTrack = queue.currentTrack;
      const tracks = queue.tracks.toArray().slice(0, 5);
      const queueString = [
        `**Sonando ahora:**\n🎶 [${currentTrack.title.slice(0, 100)}](${currentTrack.url})`,
        '**Siguientes:**',
        tracks.length
          ? tracks.map((track, index) =>
            `**${index + 1}.** [${track.title.slice(0, 100)}](${track.url})`
          ).join('\n')
          : 'No hay más canciones en la cola.',
      ].join('\n\n').slice(0, 4000);

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📋 Cola de Reproducción')
        .setDescription(queueString);
      await interaction.reply({ embeds: [embed] });
      return;
    }
  }
}

client.once('ready', async () => {
  console.log(`🤖 MODEOS EL OBI MUSICA iniciado como: ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Comandos Slash registrados exitosamente.');
  } catch (error) {
    console.error('❌ Error al registrar comandos Slash:', error);
  }
});

client.on('error', error => {
  console.error('Error del cliente de Discord:', error);
});

player.events.on('playerStart', (queue, track) => {
  const embed = new EmbedBuilder()
    .setColor('#1DB954')
    .setTitle('🎶 Sonando ahora')
    .setDescription(`[${track.title.slice(0, 200)}](${track.url})`)
    .addFields(
      { name: 'Duración', value: track.duration || 'Desconocida', inline: true },
      { name: 'Solicitado por', value: `${track.requestedBy || 'Desconocido'}`, inline: true },
      { name: 'Volumen', value: `${queue.node.volume}%`, inline: true }
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  queue.metadata.channel.send({ embeds: [embed] }).catch(error => {
    console.error('No se pudo enviar el aviso de canción iniciada:', error);
  });
});

player.events.on('playerError', (queue, error, track) => {
  console.error(`Error reproduciendo ${track?.title || 'una canción'}:`, error);
  queue.metadata.channel.send('❌ Hubo un error al reproducir esta canción.').catch(sendError => {
    console.error('No se pudo informar del error de reproducción:', sendError);
  });
});

player.events.on('error', (queue, error) => {
  console.error(`Error en la cola ${queue?.guild?.id || 'desconocida'}:`, error);
});

player.extractors.on('error', (_context, extractor, error) => {
  console.error(`No se pudo activar el extractor ${extractor.identifier}:`, error);
});

server.on('error', error => {
  console.error('Error del servidor HTTP:', error);
});

function listen(port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

async function start() {
  try {
    await listen(PORT);
    console.log(`🌐 Servidor HTTP escuchando en el puerto ${PORT}.`);
    // Do not parse user-supplied media attachments with the vulnerable ASF detector.
    const extractors = [
      YoutubeExtractor,
      SoundCloudExtractor,
      SpotifyExtractor,
      AppleMusicExtractor,
      VimeoExtractor,
      ReverbnationExtractor,
    ];
    const registeredExtractors = await Promise.all(
      extractors.map(extractor => player.extractors.register(extractor, {}))
    );
    if (!registeredExtractors[0]) {
      throw new Error('No se pudo activar el extractor de YouTube.');
    }
    await client.login(TOKEN);
  } catch (error) {
    console.error('No se pudo iniciar el servicio:', error);
    client.destroy();
    if (server.listening) server.close();
    process.exitCode = 1;
  }
}

function shutdown() {
  if (server.listening) server.close();
  client.destroy();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

client.on('interactionCreate', async interaction => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error(`Error en el comando ${interaction.commandName || 'desconocido'}:`, error);
    await sendInteractionError(interaction, '❌ Ocurrió un error al ejecutar el comando. Inténtalo de nuevo.');
  }
});

start();
