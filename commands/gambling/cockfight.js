import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

const fighters = [
  "Thunderclaw 🐓", "Ironbeak 🦅", "Shadowtalon 🐔", "Crimson Spur 🐓",
  "Bonecrusher 🐔", "Steelwing 🦅", "Razorbeak 🐓", "Stormfeather 🐔"
];

// Helper: random fighter with stats
function generateFighter() {
  return {
    name: fighters[Math.floor(Math.random() * fighters.length)],
    power: Math.floor(Math.random() * 50) + 50,  // 50–100
    stamina: Math.floor(Math.random() * 50) + 50 // 50–100
  };
}

export const data = new SlashCommandBuilder()
  .setName("cockfight")
  .setDescription("Bet on a cockfight between two fighters")
  .addStringOption(opt =>
    opt.setName("fighter")
      .setDescription("Choose Fighter A or B")
      .setRequired(true)
      .addChoices(
        { name: "Fighter A", value: "A" },
        { name: "Fighter B", value: "B" }
      )
  )
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount to bet").setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const choice = interaction.options.getString("fighter");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  if (bet <= 0 || wallet.balance < bet) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  // Generate fighters
  const fighterA = generateFighter();
  const fighterB = generateFighter();

  // Simulate fight
  const scoreA = fighterA.power + fighterA.stamina + Math.floor(Math.random() * 30);
  const scoreB = fighterB.power + fighterB.stamina + Math.floor(Math.random() * 30);

  let winner, loser, resultText, color;

  if (scoreA > scoreB) {
    winner = "A";
    loser = "B";
  } else {
    winner = "B";
    loser = "A";
  }

  if (choice === winner) {
    wallet.balance += bet;
    resultText = `🎉 Your fighter **won**! You earned **${bet} coins**.`;
    color = "Green";
  } else {
    wallet.balance -= bet;
    resultText = `💀 Your fighter **lost**! You lost **${bet} coins**.`;
    color = "Red";
  }

  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🐓 Cockfight Results")
    .setColor(color)
    .addFields(
      { name: "Fighter A", value: `${fighterA.name}\n⚡ Power: ${fighterA.power}\n💪 Stamina: ${fighterA.stamina}\n🏆 Score: ${scoreA}`, inline: true },
      { name: "Fighter B", value: `${fighterB.name}\n⚡ Power: ${fighterB.power}\n💪 Stamina: ${fighterB.stamina}\n🏆 Score: ${scoreB}`, inline: true }
    )
    .addFields({ name: "Result", value: resultText })
    .setFooter({ text: `You bet on Fighter ${choice}` });

  return interaction.reply({ embeds: [embed] });
}
