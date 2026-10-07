const {
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    EmbedBuilder
} = require('discord.js');

const categories = {
    'Seguridad y escaneo': ['escanear_admins', 'escaneo_global_admins', 'ejecutar_escaneo', 'configurar_verificacion', 'verificar', 'configurar_logs'],
    Moderación: ['advertencia', 'silenciar', 'desilenciar', 'dueno_transmision'],
    Tickets: ['configurar_tickets'],
    Reseñas: ['resena'],
    Utilidades: ['anuncio', 'sugerir', 'configurar_sugerencias', 'menu_roles', 'postular', 'configurar_bienvenida', 'ayuda']
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ayuda')
        .setDescription('Consulta los comandos disponibles organizados por categoría.'),
    categories,
    async execute(interaction) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Selecciona una categoría')
            .addOptions(Object.keys(categories).map(category => ({
                label: category,
                value: category,
                description: `Ver comandos de ${category}`
            })));
        const row = new ActionRowBuilder().addComponents(menu);
        const embed = new EmbedBuilder()
            .setTitle('📚 Centro de ayuda')
            .setDescription('Selecciona una categoría para ver sus comandos.')
            .setColor('#5865F2');

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};
