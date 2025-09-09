import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { checkRestrictions, checkCooldown, sendToJail } from "../../utils/crimeSystem.js";
import Wallet from "../../src/database/Wallet.js";

const scams = [
  { name: "lottery ticket hustle", min: 50, max: 150 },
  { name: "fake charity drive", min: 75, max: 200 },
  { name: "crypto rugpull", min: 120, max: 350 },
  { name: "grandma’s phone scam", min: 80, max: 250 },
  { name: "counterfeit sneakers", min: 100, max: 300 },
  { name: "rigged carnival game", min: 60, max: 180 }
];

export const data = new SlashCommandBuilder()
  .setName("scam")
  .setDescription("Attempt to scam some quick cash");

export async function execute(interaction) {
  const { allowed, reason, wallet } = await checkRestrictions(interaction.user.id);
  if (!allowed) return interaction.reply({ content: reason, flags: 64 });

  const cooldown = checkCooldown(wallet, "scam", 30);
  if (!cooldown.ready) return interaction.reply({ content: cooldown.message, flags: 64 });

  const scam = scams[Math.floor(Math.random() * scams.length)];
  const success = Math.random() < 0.55;

  if (success) {
    const payout = Math.floor(Math.random() * (scam.max - scam.min + 1)) + scam.min;
    const xpGain = Math.floor(payout / 25) + 5;

    wallet.balance += payout;
    wallet.xp += xpGain;
    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("🕵️ Scam Success!")
      .setColor("Green")
      .setDescription(`You ran a **${scam.name}** and walked away with:`)
      .addFields(
        { name: "💰 Coins", value: `${payout}`, inline: true },
        { name: "⭐ XP", value: `${xpGain}`, inline: true },
        { name: "📊 Warrants", value: `${wallet.warrants || 0}`, inline: true }
      )
      .setFooter({ text: "Stay low… the heat is building." });

    return interaction.reply({ embeds: [embed] });
  } else {
    // Fail: go to jail
    const punishment = await sendToJail(wallet, 5);

    const embed = new EmbedBuilder()
      .setTitle("🚨 Scam Failed!")
      .setColor("Red")
      .setDescription(`Your **${scam.name}** backfired!\n${punishment}`)
      .setFooter({ text: "Better luck next time…" });

    return interaction.reply({ embeds: [embed] });
  }
}
