import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("jail")
  .setDescription("Check your jail status");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", flags: 64 });
  }

  // If still in jail
  if (wallet.jailUntil && wallet.jailUntil > Date.now()) {
    const msRemaining = wallet.jailUntil - Date.now();
    const minutes = Math.ceil(msRemaining / 60000);
    const hours = Math.floor(minutes / 60);
    const minsLeft = minutes % 60;

    // Progress bar (max 20 bars)
    const total = wallet.jailDuration || 60; // store jail duration in mins if possible
    const done = Math.min(20, Math.floor(((total - minutes) / total) * 20));
    const bar = "█".repeat(done) + "░".repeat(20 - done);

    const embed = new EmbedBuilder()
      .setTitle("🚔 Jail Status")
      .setColor("DarkRed")
      .setDescription("You are currently serving time in jail.")
      .addFields(
        { name: "⏳ Time Remaining", value: `${hours}h ${minsLeft}m`, inline: true },
        { name: "⚖️ Reason", value: wallet.jailReason || "Unspecified crime", inline: true },
        { name: "📊 Progress", value: `\`${bar}\``, inline: false }
      )
      .setFooter({ text: "Tip: Try /bail, /breakout, or /snitch to reduce your time." });

    return interaction.reply({ embeds: [embed] });
  }

  // Not in jail
  const embed = new EmbedBuilder()
    .setTitle("✅ Jail Status")
    .setColor("Green")
    .setDescription("You are currently free. Stay out of trouble!");

  return interaction.reply({ embeds: [embed] });
}
