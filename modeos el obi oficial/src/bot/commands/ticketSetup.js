const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar_tickets')
        .setDescription('Publica el botón para crear solicitudes privadas de soporte.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se publicará el panel de atención al usuario.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');
        const createButton = new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('📩 Crear solicitud')
            .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(createButton);
        const embed = new EmbedBuilder()
            .setTitle('🎫 Atención al usuario')
            .setDescription('Pulsa el botón para abrir un canal privado con el equipo de soporte.')
            .setColor('#5865F2');

        await interaction.deferReply({ ephemeral: true });
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: `✅ Panel de tickets publicado en ${channel}.` });
    }
};
