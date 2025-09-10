import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("lawyer")
  .setDescription("Hire a lawyer to fight your warrants");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) {
    return interaction.reply({
      content: "❌ You need a wallet first. Use `/create`.",
      flags: 64,
    });
  }

  // Jail check
  if (wallet.jailUntil && wallet.jailUntil > Date.now()) {
    const remaining = Math.ceil((wallet.jailUntil - Date.now()) / 60000);
    return interaction.reply({
      content: `🚔 You are currently in jail! You must wait **${remaining} minutes** before hiring another lawyer.`,
      flags: 64,
    });
  }

  if (!wallet.warrants || wallet.warrants <= 0) {
    return interaction.reply({
      content: "✅ You have no warrants to fight right now.",
      flags: 64,
    });
  }

  // Cost increases with warrants
  const baseCost = 250;
  const cost = baseCost * wallet.warrants;

  if (wallet.balance < cost) {
    return interaction.reply({
      content: `❌ Hiring a lawyer costs **${cost} coins** (you don’t have enough).`,
      flags: 64,
    });
  }

  // Deduct lawyer cost
  wallet.balance -= cost;

  // Judge mood (affects fairness)
  const judgeMood = Math.random(); // 0–1
  const successChance = Math.min(
    0.4 + wallet.warrants * 0.1 + (judgeMood > 0.8 ? 0.15 : judgeMood < 0.2 ? -0.15 : 0),
    0.95
  );

  if (Math.random() < successChance) {
    // ✅ Win case
    const reduced = Math.ceil(wallet.warrants / 2);
    wallet.warrants -= reduced;
    if (wallet.warrants < 0) wallet.warrants = 0;

    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("⚖️ Lawyer Victory")
      .setColor("Green")
      .setDescription("Your lawyer dazzled the court and got some warrants dropped!")
      .addFields(
        { name: "💰 Cost Paid", value: `${cost} coins`, inline: true },
        { name: "📉 Warrants Reduced", value: `${reduced}`, inline: true },
        { name: "📊 Current Warrants", value: `${wallet.warrants}`, inline: true }
      )
      .setFooter({ text: judgeMood > 0.8 ? "The judge was in a good mood today." : "Justice served... for now." });

    return interaction.reply({ embeds: [embed] });
  } else {
    // ❌ Lose case → advanced penalties
    const penalties = [];

    // Base penalty: wasted cost
    penalties.push({
      type: "courtFees",
      label: "Court Fees",
      value: Math.floor(cost * 0.15),
      desc: "The judge demanded extra fees after your loss.",
    });

    // If warrants are high → harsher punishments possible
    if (wallet.warrants >= 3) {
      penalties.push(
        { type: "fine", label: "Extra Fine", value: Math.floor(cost * 0.25), desc: "You were slapped with a heavy fine." },
        { type: "jail", label: "Jail Time", value: 15, desc: "The judge gave you 15 minutes in jail." }
      );
    }

    // If warrants are extreme → rare punishment
    if (wallet.warrants >= 5 && Math.random() < 0.25) {
      penalties.push({
        type: "seizure",
        label: "Asset Seizure",
        value: Math.floor(wallet.balance * 0.3),
        desc: "The court seized 30% of your assets.",
      });
    }

    // Reputation always a risk
    penalties.push({
      type: "reputation",
      label: "Reputation Damage",
      value: 10,
      desc: "Your reputation took a hit after losing in court.",
    });

    // Pick 1–2 random penalties
    const chosenPenalties = penalties.sort(() => 0.5 - Math.random()).slice(0, 2);

    // Apply penalties
    for (const penalty of chosenPenalties) {
      if (penalty.type === "fine" || penalty.type === "courtFees") {
        wallet.balance -= penalty.value;
        if (wallet.balance < 0) wallet.balance = 0;
      }
      if (penalty.type === "jail") {
        wallet.jailUntil = Date.now() + penalty.value * 60000; // jail in minutes
      }
      if (penalty.type === "reputation") {
        if (!wallet.reputation) wallet.reputation = 100;
        wallet.reputation -= penalty.value;
        if (wallet.reputation < 0) wallet.reputation = 0;
      }
      if (penalty.type === "seizure") {
        wallet.balance -= penalty.value;
        if (wallet.balance < 0) wallet.balance = 0;
      }
    }

    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("❌ Lawyer Defeat")
      .setColor("Red")
      .setDescription("Your lawyer failed to convince the court. Penalties applied:")
      .addFields(
        { name: "💰 Cost Paid", value: `${cost} coins`, inline: true },
        ...chosenPenalties.map((p) => ({
          name: p.label,
          value: p.type === "jail" ? `${p.value} minutes` : `${p.value} coins`,
          inline: true,
        })),
        { name: "📊 Current Warrants", value: `${wallet.warrants}`, inline: true }
      )
      .setFooter({ text: "Sometimes, the house always wins..." });

    return interaction.reply({ embeds: [embed] });
  }
}
