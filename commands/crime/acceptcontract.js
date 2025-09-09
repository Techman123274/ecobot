// commands/economy/acceptcontract.js
import { SlashCommandBuilder } from "discord.js";
import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";

const hitSchema = new mongoose.Schema({
  guildId: { type: String, index: true },
  targetId: { type: String, index: true, required: true },
  bounty: { type: Number, required: true, min: 1 },
  createdBy: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
  claimedById: { type: String, default: null },
  claimedAt: { type: Date, default: null },
}, { timestamps: true });

const Hit = mongoose.models.Hit || mongoose.model("Hit", hitSchema);

export const data = new SlashCommandBuilder()
  .setName("acceptcontract")
  .setDescription("Accept and complete a hit contract")
  .addUserOption(opt =>
    opt.setName("target").setDescription("Target user").setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("target", true);

  const hunter = await Wallet.findOne({ userId: interaction.user.id });
  if (!hunter) {
    return interaction.reply({ content: "❌ You need a wallet to accept contracts.", ephemeral: true });
  }

  // Atomically claim one active contract for this guild+target
  const hit = await Hit.findOneAndUpdate(
    { guildId: interaction.guildId, targetId: target.id, active: true },
    { $set: { active: false, claimedById: interaction.user.id, claimedAt: new Date() } },
    { new: true }
  );

  if (!hit) {
    return interaction.reply({ content: "❌ No active contract on that user.", ephemeral: true });
  }

  const after = await Wallet.findOneAndUpdate(
    { userId: interaction.user.id },
    { $inc: { balance: hit.bounty } }, // use 'balance' to match your schema
    { new: true, upsert: true }
  );

  return interaction.reply(
    `🔪 Contract completed! You earned **${hit.bounty.toLocaleString()} coins** for taking out <@${target.id}>. ` +
    `Your balance is now **${(after.balance ?? 0).toLocaleString()}**.`
  );
}
