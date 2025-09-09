import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import crypto from "crypto"; // for transaction IDs

export const data = new SlashCommandBuilder()
  .setName("pay")
  .setDescription("Send coins to another user")
  .addUserOption(option =>
    option.setName("user").setDescription("The user to pay").setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName("amount").setDescription("Amount to send").setRequired(true)
  );

export async function execute(interaction) {
  const sender = interaction.user;
  const target = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");

  if (target.id === sender.id) {
    return interaction.reply({ content: "❌ You can't pay yourself.", ephemeral: true });
  }

  if (amount <= 0) {
    return interaction.reply({ content: "❌ Amount must be greater than 0.", ephemeral: true });
  }

  const senderWallet = await Wallet.findOne({ userId: sender.id });
  if (!senderWallet || senderWallet.balance < amount) {
    return interaction.reply({ content: "❌ You don't have enough coins.", ephemeral: true });
  }

  let targetWallet = await Wallet.findOne({ userId: target.id });
  if (!targetWallet) {
    targetWallet = new Wallet({ userId: target.id });
  }

  // Optional transfer fee (2%)
  const fee = Math.floor(amount * 0.02);
  const finalAmount = amount - fee;

  senderWallet.balance -= amount;
  targetWallet.balance += finalAmount;
  await senderWallet.save();
  await targetWallet.save();

  // Generate transaction ID
  const transactionId = crypto.randomBytes(4).toString("hex").toUpperCase();
  const timestamp = new Date().toLocaleString();

  // Embed for sender
  const embed = new EmbedBuilder()
    .setTitle("💸 Payment Sent")
    .setDescription(`You sent **${finalAmount} coins** to **${target.username}**.`)
    .addFields(
      { name: "Amount", value: `${amount} coins`, inline: true },
      { name: "Fee", value: `${fee} coins`, inline: true },
      { name: "Transaction ID", value: transactionId },
      { name: "Date", value: timestamp }
    )
    .setColor("Green");

  await interaction.reply({ embeds: [embed] });

  // Notify recipient in DM
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle("💰 Payment Received")
      .setDescription(`You received **${finalAmount} coins** from **${sender.username}**.`)
      .addFields(
        { name: "Transaction ID", value: transactionId },
        { name: "Date", value: timestamp }
      )
      .setColor("Gold");

    await target.send({ embeds: [dmEmbed] });
  } catch (err) {
    console.log(`⚠️ Could not DM ${target.username}.`);
  }
}
