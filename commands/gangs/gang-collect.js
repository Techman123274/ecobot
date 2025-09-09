import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";
import Territory from "../../src/database/Territory.js";

export const data = new SlashCommandBuilder()
  .setName("gang-collect")
  .setDescription("Collect daily income from your gang’s territories.");

const ONE_DAY = 24 * 60 * 60 * 1000;

export async function execute(interaction) {
  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  if (!gang) return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });

  const isStaff = ["leader", "eco"].includes(
    gang.members.find(m => m.userId === interaction.user.id)?.role
  );
  if (!isStaff) {
    return interaction.reply({ content: "❌ Only Leader or Eco can collect territory income.", flags: MessageFlags.Ephemeral });
  }

  const territories = await Territory.find({ ownerGangId: gang._id });
  if (!territories.length) {
    return interaction.reply({ content: "🗺️ Your gang owns no territories.", flags: MessageFlags.Ephemeral });
  }

  let total = 0;
  const now = Date.now();
  const lines = [];

  for (const t of territories) {
    const last = t.lastPayoutAt ? t.lastPayoutAt.getTime() : 0;
    if (now - last >= ONE_DAY) {
      total += t.income;
      t.lastPayoutAt = new Date(now);
      t.lastOwnerGangId = gang._id;
      lines.push(`✅ **${t.name}** — +$${t.income.toLocaleString()}`);
      await t.save();
    } else {
      const ms = ONE_DAY - (now - last);
      const hrs = Math.ceil(ms / 3600000);
      lines.push(`⏳ **${t.name}** — available in ~${hrs}h`);
    }
  }

  if (total > 0) {
    gang.treasury += total;
    gang.respect += Math.max(1, Math.floor(total / 5000)); // small bump for growth
    await gang.save();
  }

  const embed = new EmbedBuilder()
    .setTitle("🏦 Territory Income")
    .setColor(total > 0 ? "Green" : "Yellow")
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "💰 Added to Treasury", value: `$${total.toLocaleString()}`, inline: true },
      { name: "🏴 Gang", value: gang.name, inline: true },
    );

  return interaction.reply({ embeds: [embed] });
}
