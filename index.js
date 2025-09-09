import { Client, GatewayIntentBits, Collection, REST, Routes } from "discord.js";
import { config } from "dotenv";
import { connect } from "mongoose";
import fs from "fs";

config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();
const commandsJSON = [];

// Load commands
const commandFolders = fs.readdirSync("./commands");
for (const folder of commandFolders) {
  const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(f => f.endsWith(".js"));
  for (const file of commandFiles) {
    const command = await import(`./commands/${folder}/${file}`);
    client.commands.set(command.data.name, command);
    commandsJSON.push(command.data.toJSON()); // for deployment
  }
}

// Load events
const eventFiles = fs.readdirSync("./events").filter(f => f.endsWith(".js"));
for (const file of eventFiles) {
  const event = await import(`./events/${file}`);
  const eventName = file.split(".")[0];
  if (eventName === "ready") {
    client.once("ready", () => event.default(client));
  } else {
    client.on(eventName, (...args) => event.default(client, ...args));
  }
}

(async () => {
  try {
    // Connect to DB
    await connect(process.env.MONGO_URI);
    console.log("📦 Connected to MongoDB");

    // Deploy slash commands
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // global commands
      { body: commandsJSON }
    );
    console.log("✅ Slash commands deployed");

    // Log in bot
    client.login(process.env.TOKEN);
  } catch (err) {
    console.error("❌ Failed to start bot:", err);
  }
})();
