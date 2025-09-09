import {
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Optional rarity tiers for cars
const carValues = {
  common: { min: 500, max: 2000 },
  rare: { min: 3000, max: 7000 },
  exotic: { min: 10000, max: 20000 }
};

// Helper: decide rarity based on car name (or random if you don’t track rarity yet)
function getCarRarity(car) {
  const exoticKeywords = ["Lamborghini", "Ferrari", "Bugatti", "McLaren"];
  const rareKeywords = ["BMW", "Mercedes", "Mustang", "Camaro", "Charger"];

  if (exoticKeywords.some(k => car.includes(k))) return "exotic";
  if (rareKeywords.some(k => car.includes(k))) return "rare";
  return "common";
}

export const data = new SlashCommandBuilder()
  .setName("chopshop")
  .setDescription("Sell a stolen car for cash.")
  .addIntegerOption(opt =>
    opt.setName("index")
      .setDescription("Car number in your garage (/garage)")
      .setRequired(true)
  );

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet?.cars?.length) {
    return interaction.reply("🚗 You have no cars to sell. Steal one with `/stealcar`!");
  }

  const index = interaction.options.getInteger("index") - 1;
  if (index < 0 || index >= wallet.cars.length) {
    return interaction.reply("❌ Invalid car number. Use `/garage` to see your cars.");
  }

  const car = wallet.cars.splice(index, 1)[0]; // remove from garage
  const rarity = getCarRarity(car);
  const { min, max } = carValues[rarity];
  const value = Math.floor(Math.random() * (max - min + 1)) + min;

  wallet.balance += value;
  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🔧 Chop Shop")
    .setColor(rarity === "exotic" ? 0xf1c40f : rarity === "rare" ? 0x3498db : 0x95a5a6)
    .setDescription(`You sold your **${car}** at the chop shop.`)
    .addFields(
      { name: "Rarity", value: rarity.charAt(0).toUpperCase() + rarity.slice(1), inline: true },
      { name: "Sale Price", value: `💵 $${value.toLocaleString()}`, inline: true },
      { name: "New Balance", value: `💰 $${wallet.balance.toLocaleString()}`, inline: false }
    )
    .setFooter({ text: "Crime pays... sometimes." })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}
