import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import crypto from "crypto"; // for transaction IDs

export const data = new SlashCommandBuilder()
  .setName("bank")
  .setDescription("Bank operations")
  .addSubcommand(sub =>
    sub.setName("deposit")
      .setDescription("Deposit coins into the bank")
      .addIntegerOption(opt =>
        opt.setName("amount").setDescription("Amount to deposit").setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("withdraw")
      .setDescription("Withdraw coins from the bank")
      .addIntegerOption(opt =>
        opt.setName("amount").setDescription("Amount to withdraw").setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("balance")
      .setDescription("Check your bank balance")
  );

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  const amount = interaction.options.getInteger("amount");
  const transactionId = crypto.randomBytes(3).toString("hex").toUpperCase();
  const timestamp = new Date().toLocaleString();

  // Optional: 2% service fee for realism
  const feeRate = 0.02;
  let fee = 0;

  if (sub === "deposit") {
    if (amount <= 0 || wallet.balance < amount) {
      return interaction.reply({ content: "❌ Invalid deposit amount.", ephemeral: true });
    }
    fee = Math.floor(amount * feeRate);
    const finalAmount = amount - fee;

    wallet.balance -= amount;
    wallet.bank += finalAmount;
    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("🏦 Bank Deposit")
      .setColor("Green")
      .setDescription(`Deposit completed successfully.`)
      .addFields(
        { name: "Amount Deposited", value: `💰 ${amount.toLocaleString()} coins`, inline: true },
        { name: "Fee", value: `💸 ${fee} coins`, inline: true },
        { name: "Final Banked", value: `🏦 ${finalAmount} coins`, inline: true },
        { name: "New Bank Balance", value: `💳 ${wallet.bank.toLocaleString()} coins` }
      )
      .setFooter({ text: `Transaction ID: ${transactionId} | ${timestamp}` });

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "withdraw") {
    if (amount <= 0 || wallet.bank < amount) {
      return interaction.reply({ content: "❌ Invalid withdrawal amount.", ephemeral: true });
    }
    fee = Math.floor(amount * feeRate);
    const finalAmount = amount - fee;

    wallet.bank -= amount;
    wallet.balance += finalAmount;
    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("🏦 Bank Withdrawal")
      .setColor("Blue")
      .setDescription(`Withdrawal completed successfully.`)
      .addFields(
        { name: "Amount Requested", value: `💰 ${amount.toLocaleString()} coins`, inline: true },
        { name: "Fee", value: `💸 ${fee} coins`, inline: true },
        { name: "Final Received", value: `💳 ${finalAmount} coins`, inline: true },
        { name: "Remaining Bank Balance", value: `🏦 ${wallet.bank.toLocaleString()} coins` }
      )
      .setFooter({ text: `Transaction ID: ${transactionId} | ${timestamp}` });

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "balance") {
    const embed = new EmbedBuilder()
      .setTitle("🏦 Bank Account Overview")
      .setColor("Gold")
      .addFields(
        { name: "Wallet Balance", value: `💰 ${wallet.balance.toLocaleString()} coins`, inline: true },
        { name: "Bank Balance", value: `🏦 ${wallet.bank.toLocaleString()} coins`, inline: true }
      )
      .setFooter({ text: `Last Updated: ${timestamp}` });

    return interaction.reply({ embeds: [embed] });
  }
}
