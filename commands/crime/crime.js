import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("crime")
  .setDescription("Attempt a crime for coins and XP");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet)
    return interaction.reply({
      content: "❌ You need a wallet. Use `/create` first!",
      flags: 64,
    });

  // Check jail or hospital
  if (wallet.jailUntil && wallet.jailUntil > Date.now())
    return interaction.reply({
      content: "🚔 You’re in jail! You can’t commit crimes.",
      flags: 64,
    });
  if (wallet.hospitalUntil && wallet.hospitalUntil > Date.now())
    return interaction.reply({
      content: "🏥 You’re hospitalized and can’t act.",
      flags: 64,
    });

  // Crime odds
  const baseChance = 70;
  const penaltyPerWarrant = 8;
  const successChance = Math.max(
    20,
    baseChance - wallet.warrants * penaltyPerWarrant
  );

  const roll = Math.random() * 100;
  let embed;

  if (roll < successChance) {
    // ✅ Success outcome
    const reward = Math.floor(Math.random() * 300) + 150; // 150–450
    const xpGain = 15 + Math.floor(wallet.warrants * 2); // more risk, more xp
    wallet.balance += reward;
    wallet.xp += xpGain;

    // Rare bonus loot
    let loot = "";
    if (Math.random() < 0.1) {
      loot = "👜 You also stole a rare item!";
    }

    await wallet.save();

    embed = new EmbedBuilder()
      .setTitle("💵 Crime Success!")
      .setColor("Green")
      .setDescription(
        `You pulled off a crime and earned **${reward} coins** + ⭐ ${xpGain} XP!\n${loot}`
      )
      .setFooter({ text: `Warrants: ${wallet.warrants}` });
  } else {
    // ❌ Failure outcomes
    wallet.warrants = Math.min(wallet.warrants + 1, 5);
    const penalties = [];

    // Roll a punishment
    const failRoll = Math.random();
    if (failRoll < 0.4) {
      // Jail
      const jailTime = 1000 * 60 * 5; // 5 minutes
      wallet.jailUntil = new Date(Date.now() + jailTime);
      penalties.push("🚔 You were caught and jailed for **5 minutes**.");
    } else if (failRoll < 0.7) {
      // Hospital
      const hospitalTime = 1000 * 60 * 3; // 3 minutes
      wallet.hospitalUntil = new Date(Date.now() + hospitalTime);
      penalties.push("💀 You were injured and hospitalized for **3 minutes**.");
    } else if (failRoll < 0.9) {
      // Fine
      const fine = Math.floor(Math.random() * 200) + 100;
      wallet.balance = Math.max(0, wallet.balance - fine);
      penalties.push(`💸 You were fined **${fine} coins**.`);
    } else {
      // Critical fail
      const hospitalTime = 1000 * 60 * 5; // 5 minutes
      wallet.hospitalUntil = new Date(Date.now() + hospitalTime);
      wallet.warrants = Math.min(wallet.warrants + 2, 5);
      penalties.push(
        "🚨 Critical Fail! You botched the job badly.",
        "💀 Hospitalized for **5 minutes**.",
        "⚠️ Warrants increased by +2!"
      );
    }

    await wallet.save();

    embed = new EmbedBuilder()
      .setTitle("❌ Crime Failed!")
      .setColor("Red")
      .setDescription(
        `${penalties.join("\n")}\nYour warrants are now **${wallet.warrants}**.`
      );
  }

  return interaction.reply({ embeds: [embed] });
}
