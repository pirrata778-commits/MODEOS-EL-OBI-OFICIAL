const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anuncio')
        .setDescription('Publica un anuncio oficial en un canal del servidor.')
        .addChannelOption(opt => 
            opt.setName('canal')
               .setDescription('Canal donde se publicará el anuncio.')
               .addChannelTypes(ChannelType.GuildText)
               .setRequired(true))
        .addStringOption(opt => 
            opt.setName('mensaje')
               .setDescription('Texto que aparecerá en el anuncio.')
               .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const canal = interaction.options.getChannel('canal');
        const mensaje = interaction.options.getString('mensaje');

        const embed = new EmbedBuilder()
            .setTitle('📢 Anuncio Oficial | MODEOS EL OBI OFFICIAL')
            .setDescription(mensaje)
            .setColor('#5865F2')
            .setFooter({ text: `Publicado por ${interaction.user.tag}` })
            .setTimestamp();

        await canal.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Anuncio enviado correctamente.', ephemeral: true });
    }
};