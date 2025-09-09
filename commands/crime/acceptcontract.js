import { SlashCommandBuilder, MessageFlags } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import mongoose from "mongoose";

// Ensure Hit model exists
const Hit = mongoose.models.Hit || mongoose.model(
  "Hit",
  new mongoose.Schema({
    targetId: String,
    bounty: Number,
    active: Boolean,
  })
);

export const data = new SlashCommandBuilder()
  .setName("acceptcontract")
  .setDescription("Accept and complete a hit contract")
  .addUserOption(opt =>
    opt.setName("target")
      .setDescription("Target user")
      .setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("target");

  // Find the player’s wallet
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({
      content: "❌ You need a wallet.",
      flags: MessageFlags.Ephemeral, // replaces deprecated ephemeral:true
    });
  }

  // Check if there’s an active contract
  const hit = await Hit.findOne({ targetId: target.id, active: true });
  if (!hit) {
    return interaction.reply({
      content: "❌ No active contract on that user.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Resolve contract
  hit.active = false;
  await hit.save();

  // Pay bounty
  wallet.balance += hit.bounty;
  await wallet.save();

  return interaction.reply(
    `🔪 Contract completed! You earned **${hit.bounty.toLocaleString()} coins** for taking out <@${target.id}>.`
  );
}
