import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import mongoose from "mongoose";

// Simple Lottery Schema
const lotterySchema = new mongoose.Schema({
  tickets: { type: Map, of: [String], default: {} }, // userId -> array of tickets
  jackpot: { type: Number, default: 0 },
  ticketPrice: { type: Number, default: 100 },
  createdAt: { type: Date, default: Date.now }
});

const Lottery = mongoose.models.Lottery || mongoose.model("Lottery", lotterySchema);

export const data = new SlashCommandBuilder()
  .setName("lottery")
  .setDescription("Join the lottery")
  .addSubcommand(sub =>
    sub.setName("buy")
      .setDescription("Buy lottery tickets")
      .addIntegerOption(opt =>
        opt.setName("amount").setDescription("Number of tickets to buy").setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("jackpot")
      .setDescription("Check the current jackpot")
  )
  .addSubcommand(sub =>
    sub.setName("draw")
      .setDescription("Draw a winner (Admin only)")
  );

export async function execute(interaction) {
  let lottery = await Lottery.findOne();
  if (!lottery) {
    lottery = new Lottery();
    await lottery.save();
  }

  const sub = interaction.options.getSubcommand();

  // Buy tickets
  if (sub === "buy") {
    const amount = interaction.options.getInteger("amount");
    const wallet = await Wallet.findOne({ userId: interaction.user.id });

    if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
    if (amount <= 0) return interaction.reply({ content: "❌ Invalid ticket amount.", ephemeral: true });

    const totalCost = lottery.ticketPrice * amount;
    if (wallet.balance < totalCost) {
      return interaction.reply({ content: `❌ You don’t have enough coins. Each ticket costs ${lottery.ticketPrice}.`, ephemeral: true });
    }

    // Deduct coins, add tickets
    wallet.balance -= totalCost;
    const userTickets = lottery.tickets.get(interaction.user.id) || [];
    for (let i = 0; i < amount; i++) {
      userTickets.push(`${interaction.user.id}-${Date.now()}-${i}`);
    }
    lottery.tickets.set(interaction.user.id, userTickets);
    lottery.jackpot += totalCost;

    await wallet.save();
    await lottery.save();

    return interaction.reply(`🎟️ You bought **${amount} tickets** for **${totalCost} coins**! Jackpot is now **${lottery.jackpot} coins**.`);
  }

  // Check jackpot
  if (sub === "jackpot") {
    const embed = new EmbedBuilder()
      .setTitle("🎰 Lottery Jackpot")
      .setColor("Gold")
      .setDescription(`💰 Current Jackpot: **${lottery.jackpot} coins**\n🎟️ Ticket Price: ${lottery.ticketPrice} coins`);

    return interaction.reply({ embeds: [embed] });
  }

  // Draw winner (Admin only)
  if (sub === "draw") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Only admins can draw the lottery.", ephemeral: true });
    }

    const allTickets = Array.from(lottery.tickets.values()).flat();
    if (allTickets.length === 0) {
      return interaction.reply("❌ No tickets sold for this round.");
    }

    // Pick random winner
    const winningTicket = allTickets[Math.floor(Math.random() * allTickets.length)];
    const winnerId = winningTicket.split("-")[0];
    const winnerWallet = await Wallet.findOne({ userId: winnerId });

    if (winnerWallet) {
      winnerWallet.balance += lottery.jackpot;
      await winnerWallet.save();
    }

    const embed = new EmbedBuilder()
      .setTitle("🎉 Lottery Winner!")
      .setColor("Green")
      .setDescription(`🎟️ Winning Ticket: **${winningTicket}**\n👑 Winner: <@${winnerId}>\n💰 Jackpot: **${lottery.jackpot} coins**`);

    // Reset lottery
    lottery.tickets = {};
    lottery.jackpot = 0;
    await lottery.save();

    return interaction.reply({ embeds: [embed] });
  }
}
