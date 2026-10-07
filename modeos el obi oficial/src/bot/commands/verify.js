const { SlashCommandBuilder } = require('discord.js');
const { createCaptchaChallenge } = require('../utils/captcha');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verificar')
        .setDescription('Completa la prueba de seguridad para obtener acceso al servidor.'),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'La verificación solo está disponible en un servidor.', ephemeral: true });
        }
        return interaction.reply(createCaptchaChallenge(interaction.user.id, interaction.guildId));
    }
};