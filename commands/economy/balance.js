import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your wallet balance");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({
      content: "❌ You don't have a wallet. Use `/create` first!",
      ephemeral: true,
    });
  }

  // XP system: next level requires (level * 100) XP
  const nextLevelXP = wallet.level * 100;
  const progress = Math.min(wallet.xp / nextLevelXP, 1);
  const progressBar = makeProgressBar(progress);

  const embed = new EmbedBuilder()
    .setTitle(`💳 ${interaction.user.username}'s Wallet`)
    .setColor("Gold")
    .addFields(
      { name: "Balance", value: `💰 ${wallet.balance.toLocaleString()} coins`, inline: true },
      { name: "Level", value: `⭐ ${wallet.level}`, inline: true },
      { name: "XP", value: `🪙 ${wallet.xp} / ${nextLevelXP}`, inline: true },
      { name: "Progress", value: progressBar, inline: false },
    )
    .setFooter({ text: `Wallet ID: ${wallet._id}` });

  if (wallet.streak) {
    embed.addFields({ name: "Daily Streak", value: `🔥 ${wallet.streak} days`, inline: true });
  }

  return interaction.reply({ embeds: [embed] });
}

// Helper: Progress bar (10 slots)
function makeProgressBar(progress) {
  const totalBars = 10;
  const filledBars = Math.round(progress * totalBars);
  const emptyBars = totalBars - filledBars;
  return "▰".repeat(filledBars) + "▱".repeat(emptyBars);
}
