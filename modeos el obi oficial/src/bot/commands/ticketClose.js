const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const { pool } = require('../../../config/database');

const MAX_TRANSCRIPT_MESSAGES = 10_000;

async function createTranscript(channel) {
    const messages = [];
    let before;

    while (messages.length < MAX_TRANSCRIPT_MESSAGES) {
        const batch = await channel.messages.fetch({
            limit: Math.min(100, MAX_TRANSCRIPT_MESSAGES - messages.length),
            ...(before ? { before } : {})
        });
        if (!batch.size) break;

        messages.push(...batch.values());
        const oldestMessage = batch.reduce((oldest, message) =>
            !oldest || message.createdTimestamp < oldest.createdTimestamp ? message : oldest, null);
        before = oldestMessage.id;
        if (batch.size < 100) break;
    }

    const transcript = messages
        .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
        .map(message => {
            const timestamp = new Date(message.createdTimestamp).toISOString();
            const embedContent = message.embeds.map(embed => [
                embed.title,
                embed.description,
                ...(embed.fields || []).map(field => `${field.name}: ${field.value}`)
            ].filter(Boolean).join('\n')).filter(Boolean).join('\n');
            const content = [message.content, embedContent].filter(Boolean).join('\n') || '[Mensaje sin texto]';
            const attachments = [...message.attachments.values()].map(file => file.url);
            return {
                timestamp,
                author: message.author.tag,
                authorId: message.author.id,
                content,
                attachments
            };
        });

    if (messages.length === MAX_TRANSCRIPT_MESSAGES) {
        transcript.push({
            timestamp: new Date().toISOString(),
            author: 'Sistema',
            authorId: null,
            content: `Transcripción limitada a ${MAX_TRANSCRIPT_MESSAGES} mensajes.`,
            attachments: []
        });
    }

    return { messageCount: messages.length, messages: transcript };
}

async function closeTicket(interaction) {
    const channel = interaction.channel;
    const ownerId = channel?.topic?.match(/^ticket-owner:(\d+)$/)?.[1];

    if (!ownerId) {
        return interaction.reply({ content: 'Este canal no parece ser una solicitud de soporte válida.', ephemeral: true });
    }

    const isAdministrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (interaction.user.id !== ownerId && !isAdministrator) {
        return interaction.reply({ content: 'Solo quien abrió la solicitud o una persona administradora puede cerrarla.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const { messageCount, messages } = await createTranscript(channel);
    const savedTranscript = await pool.query(
        `INSERT INTO ticket_transcripts
            (guild_id, channel_id, owner_id, closed_by_id, message_count, messages)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [interaction.guildId, channel.id, ownerId, interaction.user.id, messageCount, JSON.stringify(messages)]
    );
    const transcriptId = savedTranscript.rows[0].id;

    let surveySent = false;
    try {
        const ticketOwner = await interaction.client.users.fetch(ownerId);
        const surveyRow = new ActionRowBuilder().addComponents(
            [1, 2, 3, 4, 5].map(rating => new ButtonBuilder()
                .setCustomId(`ticket_rating:${transcriptId}:${rating}`)
                .setLabel(`${rating} estrella${rating === 1 ? '' : 's'}`)
                .setStyle(rating >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary))
        );
        await ticketOwner.send({
            embeds: [new EmbedBuilder()
                .setTitle('Valoración de la atención')
                .setDescription('¿Cómo valorarías la atención recibida? Selecciona de una a cinco estrellas.')
                .setColor('#5865F2')],
            components: [surveyRow]
        });
        surveySent = true;
    } catch (error) {
        console.warn(`No se pudo enviar la encuesta de valoración a ${ownerId}:`, error.message);
    }

    await interaction.editReply({
        content: `La transcripción (${messageCount} mensajes) quedó guardada. ${surveySent
            ? 'Se envió una encuesta privada al usuario.'
            : 'No se pudo enviar la encuesta privada; el usuario puede tener los mensajes directos cerrados.'} El canal se eliminará en cinco segundos.`
    });
    setTimeout(async () => {
        try {
            await channel.delete(`Solicitud cerrada por ${interaction.user.tag}`);
        } catch (error) {
            console.error(`No se pudo eliminar el canal de solicitud ${channel.id}:`, error);
        }
    }, 5000);
}

async function handleTicketRating(interaction) {
    const [, transcriptId, rating] = interaction.customId.match(/^ticket_rating:(\d+):([1-5])$/) || [];
    if (!transcriptId || !rating) {
        return interaction.reply({ content: 'Esta encuesta de valoración no es válida.', ephemeral: true });
    }

    const result = await pool.query(
        `INSERT INTO ticket_ratings (transcript_id, guild_id, user_id, rating)
         SELECT id, guild_id, owner_id, $2
         FROM ticket_transcripts
         WHERE id = $1 AND owner_id = $3
         ON CONFLICT (transcript_id) DO UPDATE
            SET rating = EXCLUDED.rating,
                created_at = CURRENT_TIMESTAMP
            WHERE ticket_ratings.user_id = EXCLUDED.user_id
         RETURNING id`,
        [transcriptId, Number(rating), interaction.user.id]
    );

    if (!result.rowCount) {
        return interaction.reply({ content: 'No se pudo registrar la valoración de esta encuesta.', ephemeral: true });
    }
    return interaction.reply({ content: `Gracias. Se registró tu valoración de ${rating} de 5 estrellas.`, ephemeral: true });
}

module.exports = { closeTicket, handleTicketRating };