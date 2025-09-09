import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Example multipliers (symmetric like real Plinko board)
const multipliers = [0, 0.5, 1, 2, 5, 2, 1, 0.5, 0];

function weightedRandom() {
  // bias toward middle slots
  const weights = [1, 2, 4, 6, 8, 6, 4, 2, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return multipliers.length - 1;
}

export const data = new SlashCommandBuilder()
  .setName("plinko")
  .setDescription("Drop a ball in Plinko and win multipliers")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Amount to bet")
      .setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }

  if (bet <= 0 || wallet.balance < bet) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  // Pick landing slot
  const slot = weightedRandom();
  const multiplier = multipliers[slot];
  const winnings = Math.floor(bet * multiplier);

  // Update wallet
  if (winnings === 0) {
    wallet.balance -= bet;
  } else {
    wallet.balance += winnings - bet; // net gain
  }
  await wallet.save();

  const resultText =
    winnings > 0
      ? `🎉 Your ball landed in slot **${slot + 1}** (x${multiplier}). You won **${winnings} coins**!`
      : `💀 Your ball landed in slot **${slot + 1}** (x${multiplier}). You lost your bet.`;

  const embed = new EmbedBuilder()
    .setTitle("🟢 Plinko")
    .setColor(winnings > 0 ? "Green" : "Red")
    .setDescription(`Bet: **${bet} coins**\n\n${resultText}`)
    .setFooter({ text: "Plinko board multipliers: " + multipliers.join(" | ") });

  return interaction.reply({ embeds: [embed] });
}
