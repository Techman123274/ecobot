// commands/economy/acceptcontract.js
import { SlashCommandBuilder } from "discord.js";
import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";

// Hit model with sensible defaults and guild scoping
const Hit =
  mongoose.models.Hit ||
  mongoose.model(
    "Hit",
    new mongoose.Schema(
      {
        guildId: { type: String, index: true },
        creatorId: { type: String, index: true },
        targetId: { type: String, index: true, required: true },
        bounty: { type: Number, required: true, min: 1 },
        active: { type: Boolean, default: true, index: true },
        claimedById: { type: String, default: null },
        claimedAt: { type: Date, default: null },
      },
      { timestamps: true }
    )
  );

export const data = new SlashCommandBuilder()
  .setName("acceptcontract")
  .setDescription("Accept and complete a hit contract")
  .addUserOption((opt) =>
    opt.setName("target").setDescription("Target user").setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("target", true);

  // Ensure the caller has a wallet (eco uses cash/bank fields)
  const hunter = await Wallet.findOne({ userId: interaction.user.id });
  if (!hunter) {
    return interaction.reply({
      content: "❌ You need a wallet to accept contracts.",
      ephemeral: true,
    });
  }

  // Atomically grab an active hit for this guild+target and mark it inactive
  // This prevents two people from claiming the same bounty.
  const hit = await Hit.findOneAndUpdate(
    { guildId: interaction.guildId, targetId: target.id, active: true },
    { $set: { active: false, claimedById: interaction.user.id, claimedAt: new Date() } },
    { new: true }
  );

  if (!hit) {
    return interaction.reply({
      content: "❌ No active contract on that user.",
      ephemeral: true,
    });
  }

  // Pay the bounty safely to eco's 'cash' field (not 'balance')
  const after = await Wallet.findOneAndUpdate(
    { userId: interaction.user.id },
    { $inc: { cash: hit.bounty } },
    { new: true, upsert: true } // upsert in case something weird happened
  );

  return interaction.reply(
    `🔪 Contract completed! You earned **$${hit.bounty.toLocaleString()}** for taking out <@${target.id}>. Your cash is now **$${(after.cash ?? 0).toLocaleString()}**.`
  );
}
