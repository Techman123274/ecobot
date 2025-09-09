import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily reward");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({
      content: "❌ You don't have a wallet. Use `/create` first!",
      ephemeral: true,
    });
  }

  const now = new Date();
  const cooldown = 24 * 60 * 60 * 1000; // 24 hours

  // Check cooldown
  if (wallet.lastDaily && now - wallet.lastDaily < cooldown) {
    const remaining = cooldown - (now - wallet.lastDaily);
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return interaction.reply({
      content: `⏳ You already claimed your daily. Try again in **${hours}h ${minutes}m**.`,
      ephemeral: true,
    });
  }

  // Daily streak logic
  const yesterday = new Date(now.getTime() - cooldown);
  if (wallet.lastDaily && wallet.lastDaily > yesterday) {
    wallet.streak = (wallet.streak || 0) + 1;
  } else {
    wallet.streak = 1;
  }

  // Reward system
  const baseReward = Math.floor(Math.random() * 150) + 150; // 150–300 coins
  const streakBonus = Math.min(wallet.streak * 20, 200); // +20 coins per streak day, capped at 200
  const totalReward = baseReward + streakBonus;
  const xpReward = 10 + Math.floor(totalReward / 50);

  wallet.balance += totalReward;
  wallet.xp += xpReward;
  wallet.lastDaily = now;
  await wallet.save();

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle("🎁 Daily Reward")
    .setDescription(`You claimed your daily reward!`)
    .addFields(
      { name: "Coins", value: `💰 ${totalReward} (Base: ${baseReward} + Streak Bonus: ${streakBonus})`, inline: false },
      { name: "XP", value: `🪙 ${xpReward}`, inline: true },
      { name: "Streak", value: `🔥 ${wallet.streak} days`, inline: true }
    )
    .setColor("Gold")
    .setFooter({ text: `Come back tomorrow for more!` });

  return interaction.reply({ embeds: [embed] });
}
