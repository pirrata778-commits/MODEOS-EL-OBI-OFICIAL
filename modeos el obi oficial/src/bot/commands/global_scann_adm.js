const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('escaneo_global_admins')
        .setDescription('Resume los administradores detectados en todos los servidores del bot.'),
    async execute(interaction) {
        if (!process.env.OWNER_ID || interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                content: 'Este escaneo global solo está disponible para el propietario del bot.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        const report = [];
        let serverIndex = 0;
        for (const guild of interaction.client.guilds.cache.values()) {
            if (serverIndex > 0) {
                await delay(5000);
            }
            serverIndex += 1;

            try {
                const members = await guild.members.fetch();
                const admins = members.filter(member =>
                    !member.user.bot && member.permissions.has(PermissionFlagsBits.Administrator)
                );
                report.push({ guild, admins });
            } catch (error) {
                console.error(`No se pudieron consultar miembros en ${guild.id}:`, error);
                report.push({ guild, admins: null });
            }
        }

        const count = report.reduce((sum, result) => sum + (result.admins?.size || 0), 0);
        const lines = report.map(({ guild, admins }) =>
            `**${guild.name}** — ${admins ? `${admins.size} administrador(es)` : 'escaneo no disponible'}`
        );
        const embed = new EmbedBuilder()
            .setTitle('🌐 Escaneo global de administradores')
            .setColor('#E74C3C')
            .setDescription(lines.join('\n').slice(0, 4000) || 'El bot todavía no está en servidores.')
            .addFields(
                { name: 'Servidores', value: String(report.length), inline: true },
                { name: 'Administradores encontrados', value: String(count), inline: true }
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};
