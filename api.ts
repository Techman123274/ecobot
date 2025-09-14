// api.ts — add an HTTP API alongside your discord.js client
import express from "express";
import cors from "cors";
import helmet from "helmet";
import type { Client } from "discord.js";

type Recent = { t: number; msg: string };
const MANAGE_GUILD = 0x20;

export function startApi(client: Client) {
  // ---- simple in-memory metrics store
  const metrics = {
    startedAt: Date.now(),
    commandsToday: 0,
    activeUsersToday: new Set<string>(),
    perGuildUses: new Map<string, number>(),
    recent: [] as Recent[],
  };

  function pushRecent(msg: string) {
    metrics.recent.unshift({ t: Date.now(), msg });
    if (metrics.recent.length > 50) metrics.recent.pop();
  }

  // ---- instrument bot events
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

  // ---- express app
  const app = express();
  const PORT = Number(process.env.BOT_API_PORT || 3001);
  const KEY = process.env.BOT_API_TOKEN || ""; // shared secret with dashboard

  app.use(helmet());
  app.use(cors({ origin: ["http://localhost:3000"], credentials: false }));
  app.use(express.json());

  // API key check (simple, effective)
  app.use((req, res, next) => {
    if (!KEY) return next(); // allow if no key set (dev)
    if (req.headers["x-bot-api-key"] !== KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  });

  // health
  app.get("/health", (_req, res) => {
    res.json({ online: !!client.readyAt, ping: client.ws.ping });
  });

  // live stats for dashboard
  app.get("/stats", (_req, res) => {
    const totalServers = client.guilds.cache.size;
    const activeUsers = metrics.activeUsersToday.size;
    const commandsToday = metrics.commandsToday;

    // top servers by interactions
    const topServers = [...metrics.perGuildUses.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, interactions]) => {
        const g = client.guilds.cache.get(id);
        return { id, name: g?.name ?? id, interactions };
      });

    // very simple uptime%
    const upMs = Date.now() - metrics.startedAt;
    const uptimePercent = 99.99; // replace with real calc if you track downtime

    res.json({
      totalServers,
      activeUsers,
      commandsToday,
      uptimePercent,
      commandUsageSeries: [], // you can fill this from your own history later
      recentActivity: metrics.recent,
      topServers,
    });
  });

  // what guilds the bot is in (for intersection with user's managed guilds)
  app.get("/guilds", async (_req, res) => {
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
