// commands/economy/hit.js
import { SlashCommandBuilder, EmbedBuilder, Colors } from "discord.js";
import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";

// Centralize Hit model once in your project to avoid schema mismatch
const hitSchema = new mongoose.Schema({
  guildId: { type: String, index: true },
  targetId: { type: String, index: true, required: true },
  bounty: { type: Number, required: true, min: 1 },
  createdBy: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
});
const Hit = mongoose.models.Hit || mongoose.model("Hit", hitSchema);

const MIN_BOUNTY = 500;

export const data = new SlashCommandBuilder()
  .setName("hit")
  .setDescription("Place a bounty on another player")
  .addUserOption(opt =>
    opt.setName("user").setDescription("The target").setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription(`Bounty amount (min ${MIN_BOUNTY})`)
      .setRequired(true)
      .setMinValue(MIN_BOUNTY)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet first.", ephemeral: true });
  }

  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "❌ You can’t place a hit on yourself.", ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: "🤖 You can’t place a hit on a bot.", ephemeral: true });
  }
  if (wallet.balance < amount) {
    return interaction.reply({ content: "❌ You don’t have enough coins.", ephemeral: true });
  }

  // Deduct & add a warrant
  wallet.balance -= amount;
  wallet.warrants = (wallet.warrants || 0) + 1;
  await wallet.save();

  // Store contract WITH guildId
  await Hit.create({
    guildId: interaction.guildId,
    targetId: target.id,
    bounty: amount,
    createdBy: interaction.user.id,
    active: true,
  });

  const embed = new EmbedBuilder()
    .setTitle("🎯 New Hit Placed!")
    .setColor(Colors.DarkRed)
    .setDescription(
      `A contract has been placed on **${target.username}**!\n` +
      `💰 **Bounty:** ${amount} coins\n` +
      `📌 Placed by: <@${interaction.user.id}>\n\n` +
      `Use /acceptcontract to claim this job.`
    );

  await interaction.reply({
    content: `✅ Hit placed on <@${target.id}> for **${amount} coins**.`,
    ephemeral: true,
  });
  await interaction.channel.send({ embeds: [embed] });
}
