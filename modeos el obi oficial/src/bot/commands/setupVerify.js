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
        .setName('configurar_verificacion')
        .setDescription('Publica el panel interactivo de verificación del servidor.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se publicará el panel de verificación.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Verificación')
            .setDescription('Pulsa el botón y completa la prueba de seguridad para obtener acceso al servidor.')
            .setColor('#5865F2');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('captcha_start')
                .setLabel('✅ Verificarme')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.deferReply({ ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        await channel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: `✅ Panel de verificación publicado en ${channel}.` });
    }
};
