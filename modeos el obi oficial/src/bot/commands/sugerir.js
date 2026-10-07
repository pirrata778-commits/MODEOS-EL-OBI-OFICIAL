const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sugerir')
        .setDescription('Envía una sugerencia para que la comunidad pueda votarla.')
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Explica la sugerencia que deseas compartir.')
                .setMaxLength(4000)
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const { rows } = await pool.query(
            'SELECT suggestion_channel_id FROM guild_configs WHERE guild_id = $1',
            [interaction.guild.id]
        );
        const channelId = rows[0]?.suggestion_channel_id;
        const channel = channelId && (
            interaction.guild.channels.cache.get(channelId)
            || await interaction.guild.channels.fetch(channelId)
        );

        if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
            return interaction.editReply({
                content: 'El canal de sugerencias no está configurado o no está disponible. Pide a una persona administradora que configure `/configurar_sugerencias`.',
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('💡 Nueva sugerencia')
            .setDescription(interaction.options.getString('mensaje'))
            .setColor('#5865F2')
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setFooter({ text: `Propuesta por ${interaction.user.id}` })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('suggestion_vote:up')
                .setLabel('👍 0')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('suggestion_vote:down')
                .setLabel('👎 0')
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: `✅ Tu sugerencia se publicó en ${channel}.` });
    }
};
