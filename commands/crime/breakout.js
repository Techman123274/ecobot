import { SlashCommandBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("breakout")
  .setDescription("Attempt to break out of jail");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) return interaction.reply({ content: "❌ You need a wallet first. Use `/create`.", flags: 64 });

  if (!wallet.jailUntil || wallet.jailUntil < Date.now())
    return interaction.reply({ content: "✅ You’re not in jail right now.", flags: 64 });

  const success = Math.random() < 0.35; // 35% chance escape
  if (success) {
    wallet.jailUntil = null;
    await wallet.save();
    return interaction.reply("🏃 You managed to break out of jail and escape!");
  } else {
    // Failure → longer sentence
    const extraTime = 1000 * 60 * 3; // +3 minutes
    wallet.jailUntil = new Date(wallet.jailUntil.getTime() + extraTime);
    wallet.warrants = Math.min(wallet.warrants + 1, 5);
    await wallet.save();

    return interaction.reply("🚔 Breakout failed! You got caught and your sentence was extended by **3 minutes**.");
  }
}
