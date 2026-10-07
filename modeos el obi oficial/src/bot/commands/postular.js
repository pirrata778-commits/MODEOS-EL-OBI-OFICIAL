const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('postular')
        .setDescription('Abre el formulario para postularte al equipo de moderación.'),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'Las postulaciones solo están disponibles dentro de un servidor.', ephemeral: true });
        }
        const modal = new ModalBuilder()
            .setCustomId('staff_application')
            .setTitle('Postulación al equipo de moderación');
        const age = new TextInputBuilder()
            .setCustomId('age')
            .setLabel('¿Cuántos años tienes?')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true);
        const experience = new TextInputBuilder()
            .setCustomId('experience')
            .setLabel('Experiencia en moderación')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true);
        const motivation = new TextInputBuilder()
            .setCustomId('motivation')
            .setLabel('¿Por qué quieres unirte al equipo?')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1500)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(age),
            new ActionRowBuilder().addComponents(experience),
            new ActionRowBuilder().addComponents(motivation)
        );
        return interaction.showModal(modal);
    }
};
