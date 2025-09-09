import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Roulette wheel numbers with colors
const rouletteWheel = [
  { num: 0, color: "Green" },
  { num: 1, color: "Red" }, { num: 2, color: "Black" },
  { num: 3, color: "Red" }, { num: 4, color: "Black" },
  { num: 5, color: "Red" }, { num: 6, color: "Black" },
  { num: 7, color: "Red" }, { num: 8, color: "Black" },
  { num: 9, color: "Red" }, { num: 10, color: "Black" },
  { num: 11, color: "Black" }, { num: 12, color: "Red" },
  { num: 13, color: "Black" }, { num: 14, color: "Red" },
  { num: 15, color: "Black" }, { num: 16, color: "Red" },
  { num: 17, color: "Black" }, { num: 18, color: "Red" },
  { num: 19, color: "Red" }, { num: 20, color: "Black" },
  { num: 21, color: "Red" }, { num: 22, color: "Black" },
  { num: 23, color: "Red" }, { num: 24, color: "Black" },
  { num: 25, color: "Red" }, { num: 26, color: "Black" },
  { num: 27, color: "Red" }, { num: 28, color: "Black" },
  { num: 29, color: "Black" }, { num: 30, color: "Red" },
  { num: 31, color: "Black" }, { num: 32, color: "Red" },
  { num: 33, color: "Black" }, { num: 34, color: "Red" },
  { num: 35, color: "Black" }, { num: 36, color: "Red" },
];

export const data = new SlashCommandBuilder()
  .setName("roulette")
  .setDescription("Bet on roulette")
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount to bet").setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("bet")
      .setDescription("Your bet (red, black, even, odd, or a number 0-36)")
      .setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const betChoice = interaction.options.getString("bet").toLowerCase();
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  if (bet <= 0 || wallet.balance < bet) return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });

  // Spin the wheel
  const result = rouletteWheel[Math.floor(Math.random() * rouletteWheel.length)];

  let winnings = 0;
  let win = false;

  // Determine outcome
  if (betChoice === "red" && result.color.toLowerCase() === "red") {
    winnings = bet * 2;
    win = true;
  } else if (betChoice === "black" && result.color.toLowerCase() === "black") {
    winnings = bet * 2;
    win = true;
  } else if (betChoice === "even" && result.num !== 0 && result.num % 2 === 0) {
    winnings = bet * 2;
    win = true;
  } else if (betChoice === "odd" && result.num % 2 === 1) {
    winnings = bet * 2;
    win = true;
  } else if (!isNaN(betChoice) && parseInt(betChoice) === result.num) {
    winnings = bet * 36;
    win = true;
  }

  // Update wallet
  if (win) {
    wallet.balance += winnings - bet;
  } else {
    wallet.balance -= bet;
  }
  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🎡 Roulette Spin")
    .setColor(win ? "Green" : "Red")
    .setDescription(
      `You bet **${bet} coins** on **${betChoice}**.\n\n🎯 The ball landed on **${result.num} (${result.color})**.`
    )
    .addFields(
      { name: "Result", value: win ? `🎉 You won **${winnings} coins**!` : "💀 You lost your bet." }
    );

  return interaction.reply({ embeds: [embed] });
}
