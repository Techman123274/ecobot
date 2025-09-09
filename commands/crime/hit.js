import { SlashCommandBuilder, EmbedBuilder, Colors } from "discord.js";
import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";

// Reuse or create Hit model (guild-scoped)
const Hit =
  mongoose.models.Hit ||
  mongoose.model(
    "Hit",
    new mongoose.Schema(
      {
        guildId: { type: String, index: true },
        targetId: { type: String, index: true, required: true },
        bounty: { type: Number, required: true, min: 1 },
        createdBy: { type: String, required: true },
        active: { type: Boolean, default: true, index: true },
        createdAt: { type: Date, default: Date.now },
      },
      { timestamps: true }
    )
  );

const MIN_BOUNTY = 500;
const MAX_BOUNTY = Number(process.env.HIT_MAX_BOUNTY ?? 100_000);

export const data = new SlashCommandBuilder()
  .setName("hit")
  .setDescription("Place a bounty on another player")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The target").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("amount")
      .setDescription(`Bounty amount (min ${MIN_BOUNTY})`)
      .setRequired(true)
      .setMinValue(MIN_BOUNTY)
      .setMaxValue(MAX_BOUNTY)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet first.", ephemeral: true });
  }

  // Basic checks
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "❌ You can’t place a hit on yourself.", ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: "🤖 You can’t place a hit on a bot.", ephemeral: true });
  }

  // Atomically deduct from 'cash' only if enough funds
  const updated = await Wallet.findOneAndUpdate(
    { userId: interaction.user.id, cash: { $gte: amount } },
    { $inc: { cash: -amount, warrants: 1 } }, // placing a hit is illegal!
    { new: true }
  );

  if (!updated) {
    return interaction.reply({ content: "❌ You don’t have enough cash.", ephemeral: true });
  }

  // Record the hit (guild-scoped)
  await Hit.create({
    guildId: interaction.guildId,
    targetId: target.id,
    bounty: amount,
    createdBy: interaction.user.id,
    active: true,
  });

  // Public embed announcement
  const embed = new EmbedBuilder()
    .setTitle("🎯 New Hit Placed!")
    .setColor(Colors.DarkRed)
    .setDescription(
      `A contract has been placed on **${target.username}**!\n` +
      `💰 **Bounty:** $${amount.toLocaleString()}\n` +
      `📌 Placed by: <@${interaction.user.id}>\n\n` +
      `Use \`/acceptcontract\` to claim this job.`
    );

  await interaction.reply({
    content: `✅ Hit placed on <@${target.id}> for **$${amount.toLocaleString()}**.`,
    ephemeral: true,
  });
  await interaction.channel.send({ embeds: [embed] });
}
