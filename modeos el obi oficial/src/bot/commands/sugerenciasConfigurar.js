const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar_sugerencias')
        .setDescription('Configura el canal donde se publicarán las sugerencias.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se recibirán las sugerencias.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('canal');
        await pool.query(
            `INSERT INTO guild_configs (guild_id, suggestion_channel_id)
             VALUES ($1, $2)
             ON CONFLICT (guild_id) DO UPDATE
             SET suggestion_channel_id = EXCLUDED.suggestion_channel_id`,
            [interaction.guild.id, channel.id]
        );

        return interaction.editReply({
            content: `✅ Canal de sugerencias configurado: ${channel}.`,
        });
    }
};
