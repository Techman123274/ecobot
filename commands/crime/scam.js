// commands/crime/scam.js
import { SlashCommandBuilder, EmbedBuilder, MessageFlags, Colors } from "discord.js";
import { checkRestrictions, checkCooldown, sendToJail } from "../../utils/crimeSystem.js";
import Wallet from "../../src/database/Wallet.js";

const scams = [
  { name: "lottery ticket hustle", min: 50, max: 150 },
  { name: "fake charity drive",   min: 75, max: 200 },
  { name: "crypto rugpull",       min: 120, max: 350 },
  { name: "grandma’s phone scam", min: 80, max: 250 },
  { name: "counterfeit sneakers", min: 100, max: 300 },
  { name: "rigged carnival game", min: 60, max: 180 },
];

export const data = new SlashCommandBuilder()
  .setName("scam")
  .setDescription("Attempt a quick scam. Big risk, quick coins.");

export async function execute(interaction) {
  // restrictions (jail/hospital/dead) + get wallet
  const { allowed, reason, wallet } = await checkRestrictions(interaction.user.id, "scam");
  if (!allowed) return interaction.reply({ content: reason, flags: MessageFlags.Ephemeral });

  // cooldown (your helper probably persists internally)
  const cd = checkCooldown(wallet, "scam", 30);
  if (!cd.ready) return interaction.reply({ content: cd.message, flags: MessageFlags.Ephemeral });

  const scam = scams[Math.floor(Math.random() * scams.length)];
  const success = Math.random() < 0.55;

  if (success) {
    const payout = Math.floor(Math.random() * (scam.max - scam.min + 1)) + scam.min;
    const xpGain = Math.floor(payout / 25) + 5;

    // ✅ avoid parallel save on same doc — do an atomic update
    await Wallet.updateOne(
      { userId: wallet.userId },
      { $inc: { cash: payout, xp: xpGain } }
    );

    // fetch fresh values for display
    const updated = await Wallet.findOne({ userId: wallet.userId });

    const embed = new EmbedBuilder()
      .setTitle("🕵️ Scam Success!")
      .setColor(Colors.Green)
      .setDescription(`You ran a **${scam.name}** and walked away with:`)
      .addFields(
        { name: "💰 Coins", value: `${payout}`, inline: true },
        { name: "⭐ XP", value: `${xpGain}`, inline: true },
        { name: "📊 Warrants", value: `${updated.warrants || 0}`, inline: true }
      )
      .setFooter({ text: "Stay low… the heat is building." });

    return interaction.reply({ embeds: [embed] });
  } else {
    // ❌ fail → jail (your helper saves internally)
    const punishment = await sendToJail(wallet, 5);

    // refetch to show current warrants after sendToJail (it may increment warrants)
    const after = await Wallet.findOne({ userId: wallet.userId });

    const embed = new EmbedBuilder()
      .setTitle("🚨 Scam Failed!")
      .setColor(Colors.Red)
      .setDescription(`Your **${scam.name}** backfired!\n${punishment}`)
      .addFields(
        { name: "📊 Warrants", value: `${after.warrants || 0}`, inline: true }
      )
      .setFooter({ text: "Better luck next time…" });

    return interaction.reply({ embeds: [embed] });
  }
}
