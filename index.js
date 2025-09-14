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
import { UserModel, CommandLogModel } from "./models.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------
// 1) Create client
// -----------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();
const commandsJSON = [];

// -----------------------
// 2) Load commands
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
// 3) Load events
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
// 4) Metrics
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

client.dashboard = { metrics, pushRecent };

client.on("ready", () => pushRecent(`Bot ready as ${client.user?.tag}`));
client.on("guildCreate", (g) => pushRecent(`Added to guild: ${g.name}`));
client.on("guildDelete", (g) => pushRecent(`Removed from guild: ${g.name}`));

// helper to serialize options snapshot
function serializeOptions(i) {
  try {
    return i?.options?.data ?? [];
  } catch {
    return [];
  }
}

// record & execute commands
client.on("interactionCreate", async (i) => {
  const isSlash = typeof i.isChatInputCommand === "function" && i.isChatInputCommand();
  const isCtx   = typeof i.isContextMenuCommand === "function" && i.isContextMenuCommand();
  if (!isSlash && !isCtx) return;

  // labels
  const userTag =
    i.user?.discriminator && i.user.discriminator !== "0"
      ? `${i.user.username}#${i.user.discriminator}`
      : `@${i.user?.username || "unknown"}`;
  let cmd = isSlash ? `/${i.commandName}` : i.commandName;
  let sub = null;
  try {
    sub = i.options?.getSubcommand?.(false) || null;
    if (sub) cmd += ` ${sub}`;
  } catch {}
  const where = i.guild ? ` in ${i.guild.name}` : "";

  // metrics / recent
  pushRecent(`Command ${cmd} by ${userTag}${where}`);
  metrics.commandsToday++;
  metrics.activeUsersToday.add(i.user.id);
  if (i.guildId) {
    metrics.perGuildUses.set(i.guildId, (metrics.perGuildUses.get(i.guildId) ?? 0) + 1);
  }

  // --- DB writes (best-effort, non-blocking)
  if (mongoose.connection.readyState === 1) {
    // log document
    CommandLogModel.create({
      userId: i.user.id,
      username: i.user.username,
      discriminator: i.user.discriminator,
      globalName: i.user.globalName ?? null,
      avatar: i.user.avatar ?? null,
      guildId: i.guildId ?? null,
      guildName: i.guild?.name ?? null,
      command: i.commandName,
      subcommand: sub,
      options: serializeOptions(i),
      success: true,
    }).catch(() => {});

    // upsert user profile & counters
    UserModel.findOneAndUpdate(
      { userId: i.user.id },
      {
        $setOnInsert: { firstSeen: new Date() },
        $set: {
          username: i.user.username,
          discriminator: i.user.discriminator,
          globalName: i.user.globalName ?? null,
          avatar: i.user.avatar ?? null,
          lastSeen: new Date(),
        },
        ...(i.guildId ? { $addToSet: { guildIds: i.guildId } } : {}),
        $inc: { commandsRun: 1 },
      },
      { upsert: true, new: true }
    ).catch(() => {});
  }

  // execute the command
  const command = client.commands.get(i.commandName);
  if (!command) return;
  try {
    await command.execute(i);
  } catch (err) {
    // mark failure
    if (mongoose.connection.readyState === 1) {
      CommandLogModel.create({
        userId: i.user.id,
        username: i.user.username,
        discriminator: i.user.discriminator,
        globalName: i.user.globalName ?? null,
        avatar: i.user.avatar ?? null,
        guildId: i.guildId ?? null,
        guildName: i.guild?.name ?? null,
        command: i.commandName,
        subcommand: sub,
        options: serializeOptions(i),
        success: false,
        error: String(err?.message || err),
      }).catch(() => {});
    }

    console.error(err);
    const content = "❌ There was an error executing this command.";
    if (i.deferred || i.replied) {
      try { await i.followUp({ content, ephemeral: true }); } catch {}
    } else {
      try { await i.reply({ content, ephemeral: true }); } catch {}
    }
  }
});

// -----------------------
// 5) HTTP API (public + admin)
// -----------------------
function startApi() {
  const app = express();
  const PORT = Number(process.env.BOT_API_PORT || 3001);
  const KEY = process.env.BOT_API_TOKEN || "";
  const FRONTEND = process.env.DASHBOARD_ORIGIN || "http://localhost:3000";

  app.use(helmet());
  app.use(cors({ origin: [FRONTEND] }));
  app.use(express.json());

  // API key middleware
  app.use((req, res, next) => {
    // Public endpoints allowed without key
    if (req.path === "/health" || req.path === "/stats" || req.path === "/guilds") return next();
    // Admin endpoints require key if set
    if (KEY && req.path.startsWith("/admin/")) {
      if (req.header("x-bot-api-key") !== KEY) {
        return res.status(401).json({ error: "unauthorized" });
      }
    }
    next();
  });

  // health
  app.get("/health", (_req, res) => {
    res.json({ online: !!client.readyAt, ping: client.ws.ping });
  });

  // stats
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

  // guilds
  app.get("/guilds", (_req, res) => {
    const arr = client.guilds.cache.map((g) => ({
      id: g.id, name: g.name, icon: g.icon,
    }));
    res.json({ guilds: arr });
  });

  // ---------- ADMIN: users (paginated search) ----------
  app.get("/admin/users", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(501).json({ error: "db_not_connected" });
    }
    const q = (req.query.query || "").toString().trim();
    const page = Math.max(1, parseInt(req.query.page?.toString() || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit?.toString() || "20", 10)));
    const skip = (page - 1) * limit;

    const where = q
      ? {
          $or: [
            { userId: q },
            { username: { $regex: q, $options: "i" } },
            { globalName: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      UserModel.countDocuments(where),
      UserModel.find(where).sort({ lastSeen: -1 }).skip(skip).limit(limit).lean(),
    ]);

    res.json({
      page,
      pages: Math.ceil(total / limit),
      total,
      users: users.map(u => ({
        userId: u.userId,
        username: u.username,
        discriminator: u.discriminator,
        globalName: u.globalName,
        avatar: u.avatar,
        firstSeen: u.firstSeen,
        lastSeen: u.lastSeen,
        commandsRun: u.commandsRun,
        guildCount: u.guildIds?.length || 0,
      })),
    });
  });

  // ---------- ADMIN: user detail ----------
  app.get("/admin/users/:userId", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(501).json({ error: "db_not_connected" });
    }
    const { userId } = req.params;
    const user = await UserModel.findOne({ userId }).lean();
    if (!user) return res.status(404).json({ error: "not_found" });

    const recentLogs = await CommandLogModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();

    res.json({
      user: {
        userId: user.userId,
        username: user.username,
        discriminator: user.discriminator,
        globalName: user.globalName,
        avatar: user.avatar,
        firstSeen: user.firstSeen,
        lastSeen: user.lastSeen,
        commandsRun: user.commandsRun,
        guildIds: user.guildIds || [],
      },
      recentLogs: recentLogs.map(l => ({
        id: l._id,
        at: l.createdAt,
        guildId: l.guildId,
        guildName: l.guildName,
        command: l.command,
        subcommand: l.subcommand,
        success: l.success,
        error: l.error,
      })),
    });
  });

  // ---------- ADMIN: user logs (paginated) ----------
  app.get("/admin/users/:userId/logs", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(501).json({ error: "db_not_connected" });
    }
    const { userId } = req.params;
    const page = Math.max(1, parseInt(req.query.page?.toString() || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit?.toString() || "50", 10)));
    const skip = (page - 1) * limit;

    const where = { userId };
    const [total, logs] = await Promise.all([
      CommandLogModel.countDocuments(where),
      CommandLogModel.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    res.json({
      page,
      pages: Math.ceil(total / limit),
      total,
      logs: logs.map(l => ({
        id: l._id,
        at: l.createdAt,
        guildId: l.guildId,
        guildName: l.guildName,
        command: l.command,
        subcommand: l.subcommand,
        success: l.success,
        error: l.error,
      })),
    });
  });

  app.listen(PORT, () => {
    console.log(`[bot-api] listening on http://localhost:${PORT}`);
  });
}

// -----------------------
// 6) Bootstrap
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

    startApi();
    if (!process.env.TOKEN) throw new Error("Missing TOKEN in env");
    await client.login(process.env.TOKEN);
    console.log("🤖 Logged in");
  } catch (err) {
    console.error("❌ Failed to start bot:", err);
  }
})();
