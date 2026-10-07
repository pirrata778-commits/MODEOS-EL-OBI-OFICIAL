const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const { hasRestrictedPermissions } = require('../utils/selfRolePermissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('menu_roles')
        .setDescription('Publica un menú para que los miembros puedan asignarse o quitarse roles.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se publicará el menú de roles.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol1')
                .setDescription('Primer rol que podrán asignarse los miembros.')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol2')
                .setDescription('Segundo rol que podrán asignarse los miembros.'))
        .addRoleOption(option =>
            option.setName('rol3')
                .setDescription('Tercer rol que podrán asignarse los miembros.'))
        .addRoleOption(option =>
            option.setName('rol4')
                .setDescription('Cuarto rol que podrán asignarse los miembros.'))
        .addRoleOption(option =>
            option.setName('rol5')
                .setDescription('Quinto rol que podrán asignarse los miembros.'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');
        const roles = ['rol1', 'rol2', 'rol3', 'rol4', 'rol5']
            .map(name => interaction.options.getRole(name))
            .filter(Boolean);

        if (roles.some(role =>
            role.id === interaction.guild.id || role.managed || hasRestrictedPermissions(role)
        )) {
            return interaction.reply({
                content: 'No se pueden ofrecer roles gestionados, @everyone ni roles con permisos de moderación o administración.',
                ephemeral: true
            });
        }

        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)
            || roles.some(role => role.position >= botMember.roles.highest.position)) {
            return interaction.reply({
                content: 'El bot necesita Gestionar roles y tener un rol superior a todos los roles del menú.',
                ephemeral: true
            });
        }

        const rows = [];
        for (let index = 0; index < roles.length; index += 5) {
            const buttons = roles.slice(index, index + 5).map(role =>
                new ButtonBuilder()
                    .setCustomId(`selfrole:${role.id}`)
                    .setLabel(role.name.slice(0, 80))
                    .setStyle(ButtonStyle.Secondary)
            );
            rows.push(new ActionRowBuilder().addComponents(buttons));
        }

        const embed = new EmbedBuilder()
            .setTitle('🎭 Roles disponibles')
            .setDescription('Pulsa un botón para asignarte el rol. Vuelve a pulsarlo para quitártelo.')
            .setColor('#5865F2');

        await interaction.deferReply({ ephemeral: true });
        await channel.send({ embeds: [embed], components: rows });
        return interaction.editReply({ content: `✅ Menú de roles publicado en ${channel}.` });
    }
};
