// index.js — discord.js bot + tiny HTTP API (pure JS ESM)
import { Client, GatewayIntentBits, Collection, REST, Routes } from "discord.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------
// 1) Create client
// -----------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// runtime-only property; no TS needed
client.commands = new Collection();
const commandsJSON = [];

// -----------------------
// 2) Load commands (on startup)
//    expects ./commands/<folder>/*.js exporting { data, execute }
// -----------------------
async function loadCommands() {
  const base = path.resolve(process.cwd(), "commands");
  if (!fs.existsSync(base)) return;
  const folders = fs.readdirSync(base);

  for (const folder of folders) {
    const dir = path.join(base, folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));

    for (const file of files) {
      const abs = path.join(dir, file);
      const mod = await import(pathToFileURL(abs).href);
      const command = mod.default ?? mod;
      if (!command?.data?.name || typeof command?.execute !== "function") continue;
      client.commands.set(command.data.name, command);
      if (typeof command.data.toJSON === "function") {
        commandsJSON.push(command.data.toJSON());
      }
    }
  }
}

// -----------------------
// 3) Load events (on startup)
//    expects ./events/*.js default export: (client, ...args) => {}
//    filename (e.g. ready.js, interactionCreate.js) is the event name
// -----------------------
async function loadEvents() {
  const dir = path.resolve(process.cwd(), "events");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const abs = path.join(dir, file);
    const mod = await import(pathToFileURL(abs).href);
    const handler = mod.default ?? mod;
    const eventName = file.split(".")[0];

    if (eventName === "ready") {
      client.once("ready", () => handler(client));
    } else {
      client.on(eventName, (...args) => handler(client, ...args));
    }
  }
}

// -----------------------
// 4) Lightweight metrics
// -----------------------
const metrics = {
  startedAt: Date.now(),
  commandsToday: 0,
  activeUsersToday: new Set(),
  perGuildUses: new Map(),
  recent: [],
};

function pushRecent(msg) {
  metrics.recent.unshift({ t: Date.now(), msg });
  if (metrics.recent.length > 50) metrics.recent.pop();
}

client.on("ready", () => pushRecent(`Bot ready as ${client.user?.tag}`));
client.on("guildCreate", (g) => pushRecent(`Added to guild: ${g.name}`));
client.on("guildDelete", (g) => pushRecent(`Removed from guild: ${g.name}`));
client.on("interactionCreate", (i) => {
  if (!i.isChatInputCommand()) return;
  metrics.commandsToday++;
  metrics.activeUsersToday.add(i.user.id);
  if (i.guildId) {
    metrics.perGuildUses.set(i.guildId, (metrics.perGuildUses.get(i.guildId) ?? 0) + 1);
  }
});

// -----------------------
// 5) Tiny HTTP API for dashboard
// -----------------------
function startApi() {
  const app = express();
  const PORT = Number(process.env.BOT_API_PORT || 3001);
  const KEY = process.env.BOT_API_TOKEN || ""; // shared secret with dashboard
  const FRONTEND = process.env.DASHBOARD_ORIGIN || "http://localhost:3000";

  app.use(helmet());
  app.use(cors({ origin: [FRONTEND] }));
  app.use(express.json());

  // simple API-key middleware
  app.use((req, res, next) => {
    if (!KEY) return next(); // allow in dev if no key
    if (req.header("x-bot-api-key") !== KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  });

  // health
  app.get("/health", (_req, res) => {
    res.json({ online: !!client.readyAt, ping: client.ws.ping });
  });

  // live stats
  app.get("/stats", (_req, res) => {
    const totalServers = client.guilds.cache.size;
    const activeUsers = metrics.activeUsersToday.size;
    const commandsToday = metrics.commandsToday;

    const topServers = [...metrics.perGuildUses.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, interactions]) => {
        const g = client.guilds.cache.get(id);
        return { id, name: g?.name ?? id, interactions };
      });

    const uptimePercent = 99.99; // placeholder

    res.json({
      totalServers,
      activeUsers,
      commandsToday,
      uptimePercent,
      commandUsageSeries: [],
      recentActivity: metrics.recent,
      topServers,
    });
  });

  // bot guilds → used by dashboard to intersect with user-managed guilds
  app.get("/guilds", (_req, res) => {
    const arr = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
    }));
    res.json({ guilds: arr });
  });

  app.listen(PORT, () => {
    console.log(`[bot-api] listening on http://localhost:${PORT}`);
  });
}

// -----------------------
// 6) Bootstrap: DB, commands, login, API
// -----------------------
(async () => {
  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("📦 Connected to MongoDB");
    }

    await loadCommands();
    await loadEvents();

    if (process.env.TOKEN && process.env.CLIENT_ID && commandsJSON.length) {
      const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commandsJSON,
      });
      console.log("✅ Slash commands deployed");
    }

    startApi(); // start HTTP API
    if (!process.env.TOKEN) throw new Error("Missing TOKEN in env");
    await client.login(process.env.TOKEN);
    console.log("🤖 Logged in");
  } catch (err) {
    console.error("❌ Failed to start bot:", err);
  }
})();
