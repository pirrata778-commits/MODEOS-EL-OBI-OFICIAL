const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resena')
        .setDescription('Publica una reseña o consulta las reseñas de un miembro.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('agregar')
                .setDescription('Publica una reseña para un miembro.')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Miembro al que se le escribirá la reseña.')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('estrellas')
                        .setDescription('Puntuación de una a cinco estrellas.')
                        .setMinValue(1)
                        .setMaxValue(5)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('comentario')
                        .setDescription('Texto de la reseña.')
                        .setMaxLength(4000)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('listar')
                .setDescription('Muestra las reseñas de un miembro.')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Miembro cuyas reseñas deseas consultar.')
                        .setRequired(true))),
    async execute(interaction) {
        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        const target = interaction.options.getUser('usuario');

        if (subcommand === 'agregar') {
            const rating = interaction.options.getInteger('estrellas');
            const comment = interaction.options.getString('comentario');

            await pool.query(
                `INSERT INTO reviews (target_user_id, author_id, rating, comment)
                 VALUES ($1, $2, $3, $4)`,
                [target.id, interaction.user.id, rating, comment]
            );

            return interaction.editReply({
                content: `✅ Tu reseña de ${rating}/5 para ${target} se guardó correctamente.`
            });
        }

        const [summary, reviews] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total, AVG(rating)::numeric(3, 2) AS average
                 FROM reviews
                 WHERE target_user_id = $1`,
                [target.id]
            ),
            pool.query(
                `SELECT author_id, rating, comment, created_at
                 FROM reviews
                 WHERE target_user_id = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 5`,
                [target.id]
            )
        ]);

        const { total, average } = summary.rows[0];
        const embed = new EmbedBuilder()
            .setTitle(`Reseñas de ${target.tag}`)
            .setThumbnail(target.displayAvatarURL())
            .setColor('#F1C40F')
            .setDescription(
                total
                    ? `**Promedio:** ${Number(average).toFixed(2)}/5 ⭐ (${total} reseña${total === 1 ? '' : 's'})`
                    : 'Este usuario todavía no tiene reseñas.'
            )
            .setTimestamp();

        for (const review of reviews.rows) {
            const date = new Date(review.created_at).toLocaleDateString('es-ES');
            const comment = review.comment.length > 900
                ? `${review.comment.slice(0, 897)}...`
                : review.comment;
            embed.addFields({
                name: `${'⭐'.repeat(review.rating)} (${review.rating}/5) • ${date}`,
                value: `${comment}\n— <@${review.author_id}>`
            });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
