const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const { pool } = require('../../../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_bienvenida')
        .setDescription('Configura el canal para el mensaje de bienvenida prémium predeterminado.')
        .addChannelOption(option => option
            .setName('canal')
            .setDescription('Canal de texto donde se enviarán las bienvenidas.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                content: 'Este comando solo puede usarse dentro de un servidor.',
                ephemeral: true
            });
        }
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
            && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'Necesitas permisos de Administrador o Gestionar servidor.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('canal');
        await pool.query(
            `INSERT INTO guild_configs (
                guild_id, welcome_channel_id, welcome_title, welcome_color,
                welcome_enable_canvas, welcome_enable_buttons
             )
             VALUES ($1, $2, '✨ ⊱┆ BIENVENIDO/A A {server} ┆⊰ ✨', '#5865F2', TRUE, TRUE)
             ON CONFLICT (guild_id) DO UPDATE SET
                welcome_channel_id = EXCLUDED.welcome_channel_id,
                welcome_title = COALESCE(guild_configs.welcome_title, EXCLUDED.welcome_title),
                welcome_color = COALESCE(guild_configs.welcome_color, EXCLUDED.welcome_color),
                welcome_enable_canvas = TRUE,
                welcome_enable_buttons = TRUE`,
            [interaction.guildId, channel.id]
        );
        await pool.query(
            `INSERT INTO guild_commands (guild_id, command_name, enabled)
             VALUES ($1, 'set_bienvenida', TRUE)
             ON CONFLICT (guild_id, command_name) DO UPDATE SET
                enabled = TRUE,
                updated_at = CURRENT_TIMESTAMP`,
            [interaction.guildId]
        );
        await pool.query(
            `INSERT INTO access_logs (source, action_type, guild_id, user_id, user_tag, details)
             VALUES ('BOT', 'WELCOME_CHANNEL_CONFIGURED', $1, $2, $3, $4)`,
            [
                interaction.guildId,
                interaction.user.id,
                interaction.user.tag.slice(0, 100),
                `Canal de bienvenida configurado: ${channel.id}`
            ]
        );

        const previewButton = new ButtonBuilder()
            .setCustomId(`welcome_preview:${interaction.guildId}:${channel.id}`)
            .setLabel('Ver Vista Previa')
            .setStyle(ButtonStyle.Primary);
        const embed = new EmbedBuilder()
            .setTitle('✅ Bienvenida configurada')
            .setColor('#5865F2')
            .setDescription(`El canal de bienvenida prémium ahora es ${channel}.`)
            .setFooter({ text: 'Canvas y botones premium activados' });

        return interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(previewButton)]
        });
    }
};