import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

const allAchievements = {
  "first_earn": "💰 First Earn — Reach 100 coins",
  "big_spender": "🛍️ Big Spender — Spend 1,000 coins",
  "rich": "💎 Rich — Reach 10,000 coins",
  "gambler": "🎲 Risk Taker — Play your first gamble",
  "daily_master": "🔥 Streak Keeper — 7-day daily streak",
};

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View your achievements");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });

  const unlocked = wallet.achievements || [];
  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username}'s Achievements`)
    .setColor("Aqua");

  for (const [id, label] of Object.entries(allAchievements)) {
    embed.addFields({
      name: label,
      value: unlocked.includes(id) ? "✅ Unlocked" : "❌ Locked",
      inline: true
    });
  }

  return interaction.reply({ embeds: [embed] });
}
