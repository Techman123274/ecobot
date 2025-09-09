import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Territory from "../../src/database/Territory.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-territories")
  .setDescription("See who owns what, and what’s unclaimed.");

export async function execute(interaction) {
  const territories = await Territory.find({}).lean();
  if (!territories.length) {
    return interaction.reply({ content: "No territories found. Seed them first.", flags: MessageFlags.Ephemeral });
  }

  const gangIds = [...new Set(territories.filter(t => t.ownerGangId).map(t => String(t.ownerGangId)))];
  const gangs = gangIds.length ? await Gang.find({ _id: { $in: gangIds } }).select("_id name").lean() : [];
  const gangMap = new Map(gangs.map(g => [String(g._id), g.name]));

  const owned = territories.filter(t => t.ownerGangId);
  const free = territories.filter(t => !t.ownerGangId);

  const ownedLines = owned.length
    ? owned.map(t => `🏴 **${t.name}** — owner: **${gangMap.get(String(t.ownerGangId)) || "Unknown"}** • 💵 $${t.income.toLocaleString()} /day • ⭐ +${t.respectBoost}`).join("\n")
    : "_None_";

  const freeLines = free.length
    ? free.map(t => `🗺️ **${t.name}** — 💵 $${t.income.toLocaleString()} /day • ⭐ +${t.respectBoost}`).join("\n")
    : "_None_";

  const embed = new EmbedBuilder()
    .setTitle("🌍 Territories")
    .setColor("DarkButNotBlack")
    .addFields(
      { name: "Owned", value: ownedLines, inline: false },
      { name: "Unclaimed", value: freeLines, inline: false },
    );

  return interaction.reply({ embeds: [embed] });
}
