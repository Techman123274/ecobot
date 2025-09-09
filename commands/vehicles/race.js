import {
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Rarity helper
function getCarRarity(car) {
  const exotic = ["Lamborghini", "Ferrari", "Bugatti", "McLaren", "Porsche"];
  const rare = ["BMW", "Mercedes", "Mustang", "Camaro", "Charger", "Supra", "Skyline"];

  if (exotic.some(k => car.includes(k))) return "exotic";
  if (rare.some(k => car.includes(k))) return "rare";
  return "common";
}

// Rarity weight for winning chances
const rarityWeights = {
  common: 1,
  rare: 1.5,
  exotic: 2
};

// Random race commentary
const raceFlavors = [
  "It was neck-and-neck until the very end!",
  "One racer dominated from the start!",
  "They nearly crashed at the corner turn!",
  "Crowds cheered as the engines roared!",
  "What an intense street battle!"
];

export const data = new SlashCommandBuilder()
  .setName("race")
  .setDescription("Race another user for bragging rights!")
  .addUserOption(opt =>
    opt.setName("opponent")
      .setDescription("Who do you want to race?")
      .setRequired(true)
  );

export async function execute(interaction) {
  const opponent = interaction.options.getUser("opponent");
  if (opponent.id === interaction.user.id) {
    return interaction.reply("❌ You can’t race yourself!");
  }

  const userWallet = await Wallet.findOne({ userId: interaction.user.id });
  const oppWallet = await Wallet.findOne({ userId: opponent.id });

  if (!userWallet?.cars?.length)
    return interaction.reply("🚗 You don’t own any cars to race!");
  if (!oppWallet?.cars?.length)
    return interaction.reply(`${opponent} doesn’t own any cars to race!`);

  // Pick random car from each
  const userCar = userWallet.cars[Math.floor(Math.random() * userWallet.cars.length)];
  const oppCar = oppWallet.cars[Math.floor(Math.random() * oppWallet.cars.length)];

  // Get rarities & weights
  const userRarity = getCarRarity(userCar);
  const oppRarity = getCarRarity(oppCar);
  const userWeight = rarityWeights[userRarity];
  const oppWeight = rarityWeights[oppRarity];

  // Weighted random winner
  const total = userWeight + oppWeight;
  const roll = Math.random() * total;
  const winner = roll < userWeight ? interaction.user : opponent;

  // Random flavor text
  const flavor = raceFlavors[Math.floor(Math.random() * raceFlavors.length)];

  const embed = new EmbedBuilder()
    .setTitle("🏁 Street Race Results")
    .setColor(winner.id === interaction.user.id ? "Green" : "Red")
    .setDescription(
      `${interaction.user} drove their **${userCar}** (${userRarity})\n` +
      `vs\n` +
      `${opponent} drove their **${oppCar}** (${oppRarity})\n\n` +
      `🎙️ ${flavor}\n\n` +
      `🏆 Winner: **${winner}**`
    )
    .setFooter({ text: "Race safe... or don’t. It’s the streets." })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}
