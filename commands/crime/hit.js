import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import mongoose from "mongoose";

// Hit contracts schema
const hitSchema = new mongoose.Schema({
  targetId: String,
  bounty: Number,
  createdBy: String,
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Hit = mongoose.models.Hit || mongoose.model("Hit", hitSchema);

export const data = new SlashCommandBuilder()
  .setName("hit")
  .setDescription("Place a bounty on another player")
  .addUserOption(opt =>
    opt.setName("user").setDescription("The target").setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Bounty amount (min 500)").setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) return interaction.reply({ content: "❌ You need a wallet first.", flags: 64 });

  // Checks
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "❌ You can’t place a hit on yourself.", flags: 64 });
  }
  if (target.bot) {
    return interaction.reply({ content: "🤖 You can’t place a hit on a bot.", flags: 64 });
  }
  if (amount < 500) {
    return interaction.reply({ content: "❌ Minimum bounty is **500 coins**.", flags: 64 });
  }
  if (wallet.balance < amount) {
    return interaction.reply({ content: "❌ You don’t have enough coins.", flags: 64 });
  }

  // Deduct balance
  wallet.balance -= amount;
  wallet.warrants = (wallet.warrants || 0) + 1; // Placing a hit is illegal!
  await wallet.save();

  // Save hit
  const hit = new Hit({ targetId: target.id, bounty: amount, createdBy: interaction.user.id });
  await hit.save();

  // Embed
  const embed = new EmbedBuilder()
    .setTitle("🎯 New Hit Placed!")
    .setColor("DarkRed")
    .setDescription(
      `A contract has been placed on **${target.username}**!\n` +
      `💰 **Bounty:** ${amount} coins\n` +
      `📌 Placed by: <@${interaction.user.id}>`
    )
    .setFooter({ text: "Use /acceptcontract to claim this job." });

  // Reply privately & broadcast in channel
  await interaction.reply({ content: `✅ Hit placed on <@${target.id}> for **${amount} coins**.`, flags: 64 });
  await interaction.channel.send({ embeds: [embed] });
}
