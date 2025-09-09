import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("lawyer")
  .setDescription("Hire a lawyer to fight your warrants");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet first. Use `/create`.", flags: 64 });
  }

  if (!wallet.warrants || wallet.warrants <= 0) {
    return interaction.reply({ content: "✅ You have no warrants to fight right now.", flags: 64 });
  }

  // Cost increases with number of warrants
  const baseCost = 250;
  const cost = baseCost * wallet.warrants;

  if (wallet.balance < cost) {
    return interaction.reply({ content: `❌ Hiring a lawyer costs **${cost} coins** (you don’t have enough).`, flags: 64 });
  }

  // Deduct cost
  wallet.balance -= cost;

  // Success chance improves if player pays more warrants
  const successChance = Math.min(0.4 + wallet.warrants * 0.1, 0.9); // 40%–90%

  if (Math.random() < successChance) {
    // Successful lawyer defense
    const reduced = Math.ceil(wallet.warrants / 2); // remove half (rounded up)
    wallet.warrants -= reduced;
    if (wallet.warrants < 0) wallet.warrants = 0;

    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("⚖️ Lawyer Hired")
      .setColor("Green")
      .setDescription(`Your lawyer successfully argued your case!`)
      .addFields(
        { name: "💰 Cost Paid", value: `${cost} coins`, inline: true },
        { name: "📉 Warrants Reduced", value: `${reduced}`, inline: true },
        { name: "📊 Current Warrants", value: `${wallet.warrants}`, inline: true }
      )
      .setFooter({ text: "Sometimes money *can* buy justice." });

    return interaction.reply({ embeds: [embed] });
  } else {
    // Failed lawyer attempt
    wallet.warrants += 1; // judge wasn’t happy
    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("❌ Lawyer Failed")
      .setColor("Red")
      .setDescription("Your lawyer fumbled the case and made things worse!")
      .addFields(
        { name: "💰 Cost Paid", value: `${cost} coins`, inline: true },
        { name: "🚨 Warrants Increased", value: `+1`, inline: true },
        { name: "📊 Current Warrants", value: `${wallet.warrants}`, inline: true }
      )
      .setFooter({ text: "Next time, hire a better lawyer…" });

    return interaction.reply({ embeds: [embed] });
  }
}
