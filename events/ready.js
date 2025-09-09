// events/ready.js
import { ActivityType } from "discord.js";

function formatNumber(n) {
  return Intl.NumberFormat("en-US").format(n);
}

export default async (client) => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // === Rotating Presence ===
  async function computeStats() {
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);
    return { guildCount, userCount };
  }

  const baseLines = [
    { type: ActivityType.Playing,   text: () => `Eco RP • /help` },
    { type: ActivityType.Watching,  text: ({ guildCount }) => `${formatNumber(guildCount)} servers` },
    { type: ActivityType.Listening, text: ({ userCount }) => `${formatNumber(userCount)} hustlers` },
    { type: ActivityType.Competing, text: () => `call 911, get paid` },
    { type: ActivityType.Watching,  text: () => `gang wars & territories` },
    { type: ActivityType.Listening, text: () => `your /scam strategies` },
    { type: ActivityType.Watching,  text: () => `built by Tech` },
  ];

  const statuses = ["online", "idle", "dnd"];
  let i = 0;

  const updatePresence = async () => {
    const { guildCount, userCount } = await computeStats();
    const line = baseLines[i % baseLines.length];
    const name = line.text({ guildCount, userCount });
    const status = statuses[Math.floor(i / baseLines.length) % statuses.length];

    client.user.setPresence({
      status,
      activities: [{ name, type: line.type }],
    });

    i++;
  };

  // set immediately + interval
  await updatePresence();
  setInterval(updatePresence, 30_000); // every 30s
};
