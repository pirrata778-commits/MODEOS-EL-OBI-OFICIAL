const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dueno_transmision')
        .setDescription('Publica un anuncio en todos los servidores; solo puede usarlo el propietario.')
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Texto del anuncio que se enviará a todos los servidores.')
                .setMaxLength(4000)
                .setRequired(true)),
    async execute(interaction) {
        if (!process.env.OWNER_ID || interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: 'Este comando es exclusivo del propietario del bot.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const message = interaction.options.getString('mensaje');
        const embed = new EmbedBuilder()
            .setTitle('📢 Anuncio oficial')
            .setDescription(message)
            .setColor('#5865F2')
            .setFooter({ text: 'MODEOS EL OBI OFFICIAL' })
            .setTimestamp();
        const results = await Promise.allSettled(
            interaction.client.guilds.cache.map(async guild => {
                const canSend = candidate =>
                    candidate?.isTextBased()
                    && typeof candidate.send === 'function'
                    && candidate.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages);
                const channel = canSend(guild.systemChannel)
                    ? guild.systemChannel
                    : guild.channels.cache.find(canSend);
                if (!channel || typeof channel.send !== 'function') {
                    throw new Error(`No hay canal publicable en ${guild.id}.`);
                }
                await channel.send({
                    embeds: [embed],
                    allowedMentions: { parse: [] }
                });
                return guild.id;
            })
        );
        const successes = results.filter(result => result.status === 'fulfilled').length;
        for (const result of results.filter(item => item.status === 'rejected')) {
            console.error('Falló un anuncio global:', result.reason);
        }
        return interaction.editReply(
            `Anuncio entregado a ${successes}/${results.length} servidores. Revisa el registro del bot para conocer los errores.`
        );
    }
};
