import { SlashCommandBuilder, MessageFlags } from "discord.js";
import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-deposit")
  .setDescription("Deposit money into your gang’s treasury.")
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount of cash to deposit").setRequired(true)
  );

export async function execute(interaction) {
  const amount = interaction.options.getInteger("amount");

  // ✅ quick checks
  if (amount <= 0) {
    return interaction.reply({
      content: "❌ Deposit amount must be greater than 0.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (amount > 1_000_000_000) {
    return interaction.reply({
      content: "⚠️ That amount is too high. Max deposit: 1 billion.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId: interaction.user.id }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ You need a wallet.", flags: MessageFlags.Ephemeral });
    }

    const gang = await Gang.findOne({ "members.userId": interaction.user.id }).session(session);
    if (!gang) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
    }

    if (wallet.balance < amount) {
      await session.abortTransaction();
      return interaction.reply({ content: "💸 You don’t have that much cash.", flags: MessageFlags.Ephemeral });
    }

    // ✅ transfer funds safely
    wallet.balance -= amount;
    gang.treasury = (gang.treasury || 0) + amount;

    await wallet.save({ session });
    await gang.save({ session });
    await session.commitTransaction();

    return interaction.reply(
      `🏴 You deposited 💵 $${amount.toLocaleString()} into **${gang.name}** treasury.\n` +
      `📦 New Treasury: $${gang.treasury.toLocaleString()}`
    );
  } catch (err) {
    await session.abortTransaction();
    console.error("Gang deposit error:", err);
    return interaction.reply({
      content: "⚠️ Deposit failed due to an error. Try again later.",
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    session.endSession();
  }
}
