import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Compare your stats with another user")
  .addUserOption(opt =>
    opt.setName("user").setDescription("The user to compare with").setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("user");
  const userWallet = await Wallet.findOne({ userId: interaction.user.id });
  const targetWallet = await Wallet.findOne({ userId: target.id });

  if (!userWallet || !targetWallet) {
    return interaction.reply({ content: "❌ Both users must have a wallet.", ephemeral: true });
  }

  // Progress bars
  const userNextXP = userWallet.level * 100;
  const targetNextXP = targetWallet.level * 100;
  const userProgress = makeProgressBar(userWallet.xp / userNextXP);
  const targetProgress = makeProgressBar(targetWallet.xp / targetNextXP);

  const embed = new EmbedBuilder()
    .setTitle("📊 Player Stats Comparison")
    .setColor("Purple")
    .addFields(
      {
        name: interaction.user.username,
        value: [
          `💰 Wallet: **${userWallet.balance.toLocaleString()}**`,
          `🏦 Bank: **${userWallet.bank.toLocaleString()}**`,
          `⭐ Level: **${userWallet.level}**`,
          `🪙 XP: ${userWallet.xp}/${userNextXP}`,
          `📈 ${userProgress}`,
          `🔥 Streak: ${userWallet.streak || 0} days`
        ].join("\n"),
        inline: true
      },
      {
        name: target.username,
        value: [
          `💰 Wallet: **${targetWallet.balance.toLocaleString()}**`,
          `🏦 Bank: **${targetWallet.bank.toLocaleString()}**`,
          `⭐ Level: **${targetWallet.level}**`,
          `🪙 XP: ${targetWallet.xp}/${targetNextXP}`,
          `📈 ${targetProgress}`,
          `🔥 Streak: ${targetWallet.streak || 0} days`
        ].join("\n"),
        inline: true
      }
    )
    .setFooter({ text: "Who’s grinding harder? 💪" });

  return interaction.reply({ embeds: [embed] });
}

// Helper: Progress bar (10 slots)
function makeProgressBar(progress) {
  const totalBars = 10;
  const filledBars = Math.round(Math.min(progress, 1) * totalBars);
  const emptyBars = totalBars - filledBars;
  return "▰".repeat(filledBars) + "▱".repeat(emptyBars);
}
