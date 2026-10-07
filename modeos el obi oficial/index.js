require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { connectDB } = require('./config/database');
const client = require('./src/bot/client');
const startWebServer = require('./src/web/server');

// Cargar Comandos Slash
const commandsPath = path.join(__dirname, 'src', 'bot', 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            if (client.commands.has(command.data.name)) {
                console.warn(`Comando duplicado ignorado (${command.data.name}) en ${file}.`);
                continue;
            }
            client.commands.set(command.data.name, command);
        }
    }
}

// Cargar eventos de forma modular; los módulos helper sin name/execute se omiten.
const eventsPath = path.join(__dirname, 'src', 'bot', 'events');
for (const file of fs.readdirSync(eventsPath).filter(name => name.endsWith('.js'))) {
    const event = require(path.join(eventsPath, file));
    if (!event.name || typeof event.execute !== 'function') continue;
    const register = event.once ? client.once.bind(client) : client.on.bind(client);
    register(event.name, (...args) => {
        Promise.resolve(event.execute(...args)).catch(error => {
            console.error(`Error no gestionado en el evento ${event.name}:`, error);
        });
    });
}

const main = async () => {
    await connectDB();
    startWebServer();
    await client.login(process.env.DISCORD_TOKEN);
};

main().catch(error => {
    console.error('No se pudo iniciar MODEOS EL OBI OFFICIAL:', error);
    process.exitCode = 1;
});