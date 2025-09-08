require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { driveSearchSessions, taskSessions, deleteSessions, scheduleSessions } = require('./sessions');
const MemoryHandler = require('./utils/memoryHandler');

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
] });

// Attach session maps to the client object
client.driveSearchSessions = driveSearchSessions;
client.taskSessions = taskSessions;
client.deleteSessions = deleteSessions;
client.scheduleSessions = scheduleSessions;
client.memory = new MemoryHandler(); // MemoryHandler 인스턴스화


client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

// Dynamically load event handlers
const eventsPath = path.join(__dirname, 'handlers');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.name && event.execute) {
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    } else {
         console.log(`[WARNING] The event at ${filePath} is missing a required "name" or "execute" property.`);
    }
}

client.login(process.env.DISCORD_TOKEN);