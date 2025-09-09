import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// payout multipliers by matches
const payouts = {
  0: 0,    // no matches = lose bet
  1: 1,    // 1 match = break even
  2: 2,    // 2 matches = 2x
  3: 5,    // 3 matches = 5x
  4: 10,   // 4 matches = 10x
  5: 20    // 5 matches = 20x
};

export const data = new SlashCommandBuilder()
  .setName("keno")
  .setDescription("Pick numbers and see if they match the draw")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Amount to bet")
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("numbers")
      .setDescription("Pick up to 5 numbers (1–20), comma separated")
      .setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const numbersInput = interaction.options.getString("numbers");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }

  if (bet <= 0 || wallet.balance < bet) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  // Parse user numbers
  const picks = numbersInput
    .split(",")
    .map(n => parseInt(n.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= 20);

  if (picks.length === 0 || picks.length > 5) {
    return interaction.reply({ content: "❌ You must pick between 1 and 5 numbers (1–20).", ephemeral: true });
  }

  // Draw 5 unique numbers
  const draw = [];
  while (draw.length < 5) {
    const n = Math.floor(Math.random() * 20) + 1;
    if (!draw.includes(n)) draw.push(n);
  }

  // Count matches
  const matches = picks.filter(n => draw.includes(n));
  const matchCount = matches.length;
  const multiplier = payouts[matchCount] || 0;
  const winnings = bet * multiplier;

  // Update balance
  if (winnings === 0) {
    wallet.balance -= bet;
  } else if (winnings > bet) {
    wallet.balance += (winnings - bet); // net gain
  }
  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🎟️ Keno")
    .setColor(matchCount > 0 ? "Green" : "Red")
    .setDescription(`Bet: **${bet} coins**`)
    .addFields(
      { name: "Your Picks", value: picks.join(", "), inline: true },
      { name: "Drawn Numbers", value: draw.join(", "), inline: true },
      { name: "Matches", value: matches.length > 0 ? matches.join(", ") : "None", inline: true }
    )
    .addFields(
      { name: "Result", value: winnings > 0 ? `🎉 You won **${winnings} coins** (x${multiplier})` : `💀 You lost your bet.` }
    )
    .setFooter({ text: `Matches: ${matchCount} | Multiplier: x${multiplier}` });

  return interaction.reply({ embeds: [embed] });
}
