import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Fake teams
const teams = [
  "Dragons 🐉", "Sharks 🦈", "Tigers 🐯", "Wolves 🐺",
  "Eagles 🦅", "Bulls 🐂", "Panthers 🐆", "Knights ⚔️"
];

export const data = new SlashCommandBuilder()
  .setName("sportsbet")
  .setDescription("Bet on a fake sports match")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Amount to bet")
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("team")
      .setDescription("Choose your team (A or B)")
      .setRequired(true)
      .addChoices(
        { name: "Team A", value: "A" },
        { name: "Team B", value: "B" }
      )
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const choice = interaction.options.getString("team");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }
  if (bet <= 0 || wallet.balance < bet) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  // Pick two random teams
  const teamA = teams[Math.floor(Math.random() * teams.length)];
  let teamB = teams[Math.floor(Math.random() * teams.length)];
  while (teamB === teamA) {
    teamB = teams[Math.floor(Math.random() * teams.length)];
  }

  // Simulate scores (0–5 range)
  const scoreA = Math.floor(Math.random() * 6);
  const scoreB = Math.floor(Math.random() * 6);

  let resultMsg;
  let color = "Red";

  if (scoreA > scoreB && choice === "A") {
    wallet.balance += bet;
    resultMsg = `🎉 Your team **${teamA}** won ${scoreA}–${scoreB}! You earned **${bet} coins**.`;
    color = "Green";
  } else if (scoreB > scoreA && choice === "B") {
    wallet.balance += bet;
    resultMsg = `🎉 Your team **${teamB}** won ${scoreB}–${scoreA}! You earned **${bet} coins**.`;
    color = "Green";
  } else if (scoreA === scoreB) {
    resultMsg = `🤝 It's a tie! ${teamA} ${scoreA}–${scoreB} ${teamB}. Your bet is refunded.`;
    color = "Yellow";
  } else {
    wallet.balance -= bet;
    resultMsg = `💀 You lost! Final score: ${teamA} ${scoreA}–${scoreB} ${teamB}. You lost **${bet} coins**.`;
  }

  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🏟️ Sports Bet Result")
    .setColor(color)
    .setDescription(resultMsg)
    .addFields(
      { name: "Team A", value: `${teamA} — ${scoreA}`, inline: true },
      { name: "Team B", value: `${teamB} — ${scoreB}`, inline: true }
    )
    .setFooter({ text: `Your bet: ${bet} coins on Team ${choice}` });

  return interaction.reply({ embeds: [embed] });
}
