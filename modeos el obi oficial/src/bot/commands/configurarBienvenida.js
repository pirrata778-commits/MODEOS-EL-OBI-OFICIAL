const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar_bienvenida')
        .setDescription('Configura el canal y el mensaje de bienvenida del servidor.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se enviarán los mensajes de bienvenida.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Mensaje de bienvenida; usa {user} para mencionar a la persona.')
                .setMaxLength(2000))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('canal');
        const message = interaction.options.getString('mensaje');

        await pool.query(
            `INSERT INTO guild_configs (guild_id, welcome_channel_id, welcome_message)
             VALUES ($1, $2, COALESCE($3, '¡Bienvenido/a {user} a MODEOS EL OBI OFFICIAL!'))
             ON CONFLICT (guild_id) DO UPDATE SET
                welcome_channel_id = EXCLUDED.welcome_channel_id,
                welcome_message = COALESCE($3, guild_configs.welcome_message)`,
            [interaction.guild.id, channel.id, message]
        );

        return interaction.editReply({
            content: `✅ Canal de bienvenida configurado: ${channel}.`
        });
    }
};