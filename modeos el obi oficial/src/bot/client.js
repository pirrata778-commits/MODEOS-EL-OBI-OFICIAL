const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

const client = new Client({
    partials: [Partials.Channel, Partials.Message],
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

module.exports = client;