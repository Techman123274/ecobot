import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Helper: figure out rarity from car name
function getCarRarity(car) {
  const exoticKeywords = ["Lamborghini", "Ferrari", "Bugatti", "McLaren", "Porsche"];
  const rareKeywords = ["BMW", "Mercedes", "Mustang", "Camaro", "Charger", "Supra", "Skyline"];

  if (exoticKeywords.some(k => car.includes(k))) return "exotic";
  if (rareKeywords.some(k => car.includes(k))) return "rare";
  return "common";
}

// Emojis for rarities
const rarityEmojis = {
  common: "🚗",
  rare: "🏎️",
  exotic: "🛑"
};

export const data = new SlashCommandBuilder()
  .setName("garage")
  .setDescription("View all cars you own.");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet || wallet.cars.length === 0) {
    return interaction.reply("🚗 You don’t own any cars yet. Try `/stealcar`!");
  }

  // Build car list with rarity and emojis
  const carLines = wallet.cars.map((c, i) => {
    const rarity = getCarRarity(c);
    const emoji = rarityEmojis[rarity] || "🚘";
    return `**${i + 1}.** ${emoji} ${c} (${rarity})`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username}’s Garage`)
    .setColor("Blue")
    .setDescription(carLines.join("\n"))
    .setFooter({ text: "Sell cars with /chopshop or race them with /race!" });

  return interaction.reply({ embeds: [embed] });
}
