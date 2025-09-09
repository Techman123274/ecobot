import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Slot symbols & payout multipliers
const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
const payouts = {
  "🍒": 2,   // 3 cherries = 2x
  "🍋": 3,   // 3 lemons = 3x
  "🔔": 5,   // 3 bells = 5x
  "💎": 10,  // 3 diamonds = 10x
  "7️⃣": 20  // 3 lucky 7 = 20x jackpot
};

export const data = new SlashCommandBuilder()
  .setName("slots")
  .setDescription("Spin the slot machine")
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

  // Deduct bet upfront
  wallet.balance -= bet;
  await wallet.save();

  // Spin 3 reels
  const reels = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);

  // Check results
  let winnings = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    winnings = bet * (payouts[reels[0]] || 0);
    wallet.balance += winnings;
    await wallet.save();
  }

  const embed = new EmbedBuilder()
    .setTitle("🎰 Slot Machine")
    .setColor(winnings > 0 ? "Green" : "Red")
    .setDescription(`Bet: **${bet} coins**\n\n🎲 Spin: ${reels.join(" | ")}`)
    .addFields(
      winnings > 0
        ? { name: "Result", value: `🎉 Jackpot! You won **${winnings} coins** (x${winnings / bet})` }
        : { name: "Result", value: "💀 No luck this time. You lost your bet." }
    )
    .setFooter({ text: "Good luck on your next spin!" });

  return interaction.reply({ embeds: [embed] });
}
