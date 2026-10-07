const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ejecutar_escaneo')
        .setDescription('Muestra los miembros que tienen permisos de administración en este servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const members = await interaction.guild.members.fetch();
        const admins = members.filter(member =>
            !member.user.bot && member.permissions.has(PermissionFlagsBits.Administrator)
        );
        const names = admins.map(member => `${member.user.tag} (${member.id})`);
        const listing = names.slice(0, 50).join('\n') || 'No se detectaron administradores.';
        const embed = new EmbedBuilder()
            .setTitle(`🔎 Escaneo de administradores • ${interaction.guild.name}`)
            .setColor('#E74C3C')
            .setDescription(listing.slice(0, 4000))
            .addFields({
                name: 'Total',
                value: `${admins.size}${admins.size > 50 ? ' (mostrando los primeros 50)' : ''}`
            })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};
