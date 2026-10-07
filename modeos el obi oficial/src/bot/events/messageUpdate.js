const { EmbedBuilder } = require('discord.js');
const { getLogChannel, truncate } = require('./messageLogUtils');

module.exports = {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || newMessage.author?.bot) return;

        try {
            if (oldMessage.partial) await oldMessage.fetch();
            if (newMessage.partial) await newMessage.fetch();
            if (oldMessage.content === newMessage.content) return;

            const channel = await getLogChannel(newMessage.guild, newMessage.client);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('✏️ Mensaje editado')
                .setColor('#F1C40F')
                .setURL(newMessage.url)
                .addFields(
                    { name: 'Autor', value: newMessage.author ? `${newMessage.author} (${newMessage.author.tag})` : 'No disponible', inline: true },
                    { name: 'Canal', value: `${newMessage.channel}`, inline: true },
                    { name: 'Contenido anterior', value: truncate(oldMessage.content) },
                    { name: 'Contenido nuevo', value: truncate(newMessage.content) }
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Error al registrar mensaje editado en ${newMessage.guild.id}:`, error);
        }
    }
};
