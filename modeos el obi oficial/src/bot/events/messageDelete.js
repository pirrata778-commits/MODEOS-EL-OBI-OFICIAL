const { EmbedBuilder } = require('discord.js');
const { getLogChannel, truncate } = require('./messageLogUtils');

module.exports = {
    name: 'messageDelete',
    async execute(message) {
        if (!message.guild || message.author?.bot) return;

        try {
            const channel = await getLogChannel(message.guild, message.client);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Mensaje eliminado')
                .setColor('#E74C3C')
                .addFields(
                    { name: 'Autor', value: message.author ? `${message.author} (${message.author.tag})` : 'No disponible', inline: true },
                    { name: 'Canal', value: `${message.channel}`, inline: true },
                    { name: 'Contenido', value: truncate(message.content) }
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Error al registrar mensaje eliminado en ${message.guild.id}:`, error);
        }
    }
};
