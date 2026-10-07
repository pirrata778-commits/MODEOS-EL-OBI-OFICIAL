require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const registeredNames = new Set();
const commandsPath = path.join(__dirname, 'src', 'bot', 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            if (!/^[a-z0-9_-]+$/.test(command.data.name)) {
                console.warn(`Nombre de comando no válido (${command.data.name}) en ${file}; se omitirá.`);
                continue;
            }
            if (registeredNames.has(command.data.name)) {
                console.warn(`Comando duplicado ignorado (${command.data.name}) en ${file}.`);
                continue;
            }
            registeredNames.add(command.data.name);
            commands.push(command.data.toJSON());
        }
    }
}

(async () => {
    if (!process.env.CLIENT_ID || !process.env.DISCORD_TOKEN) {
        console.error('Faltan CLIENT_ID o DISCORD_TOKEN para registrar los comandos.');
        process.exitCode = 1;
        return;
    }

    try {
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        console.log(`Registrando ${commands.length} comandos slash...`);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Comandos registrados con éxito.');
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
        process.exitCode = 1;
    }
})();