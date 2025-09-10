import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import config from "../../config.json" assert { type: "json" };
import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("force-event")
  .setDescription("Force a random server/game event (Dev Only)")
  .addStringOption(opt =>
    opt.setName("event")
      .setDescription("Which event do you want to trigger?")
      .setRequired(true)
      .addChoices(
        { name: "🚔 Police Raid", value: "police-raid" },
        { name: "💰 Tax Collection", value: "tax-collection" },
        { name: "🎁 Random Bonus", value: "random-bonus" }
      )
  );

export async function execute(interaction) {
  if (!config.devs.includes(interaction.user.id)) {
    return interaction.reply({ content: "❌ Devs only.", flags: 64 });
  }

  const eventName = interaction.options.getString("event");

  let embed;
  switch (eventName) {
    case "police-raid": {
      // All gangs lose some money
      const gangs = await Gang.find();
      let totalSeized = 0;
      for (const gang of gangs) {
        const loss = Math.floor((gang.funds || 0) * 0.2); // 20% raid
        gang.funds = Math.max(0, (gang.funds || 0) - loss);
        totalSeized += loss;
        await gang.save();
      }

      embed = new EmbedBuilder()
        .setTitle("🚔 Police Raid!")
        .setColor("Red")
        .setDescription("The police raided local gangs and seized illegal funds!")
        .addFields(
          { name: "💸 Total Seized", value: `${totalSeized} coins` }
        )
        .setFooter({ text: "Better lay low for a while..." });
      break;
    }

    case "tax-collection": {
      // Everyone pays 10% tax from wallet
      const wallets = await Wallet.find();
      let totalTax = 0;
      for (const wallet of wallets) {
        const tax = Math.floor(wallet.balance * 0.1);
        wallet.balance -= tax;
        if (wallet.balance < 0) wallet.balance = 0;
        totalTax += tax;
        await wallet.save();
      }

      embed = new EmbedBuilder()
        .setTitle("💰 Tax Collection")
        .setColor("Yellow")
        .setDescription("The government collected 10% tax from everyone’s wallet!")
        .addFields(
          { name: "🏛️ Total Tax Collected", value: `${totalTax} coins` }
        )
        .setFooter({ text: "Pay your dues to avoid trouble..." });
      break;
    }

    case "random-bonus": {
      // Pick 1 random player and give them coins
      const wallets = await Wallet.find();
      if (wallets.length > 0) {
        const winner = wallets[Math.floor(Math.random() * wallets.length)];
        const bonus = Math.floor(Math.random() * 2000) + 500; // 500–2500
        winner.balance += bonus;
        await winner.save();

        embed = new EmbedBuilder()
          .setTitle("🎁 Random Bonus Event")
          .setColor("Green")
          .setDescription(`<@${winner.userId}> received a surprise bonus!`)
          .addFields(
            { name: "💸 Bonus Awarded", value: `${bonus} coins` }
          )
          .setFooter({ text: "Stay active, you never know when luck strikes." });
      } else {
        embed = new EmbedBuilder()
          .setTitle("🎁 Random Bonus Event")
          .setColor("Grey")
          .setDescription("No players found to give a bonus.");
      }
      break;
    }

    default: {
      return interaction.reply({ content: "❌ Unknown event.", flags: 64 });
    }
  }

  return interaction.reply({ embeds: [embed] });
}
