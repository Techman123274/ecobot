import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("crime")
  .setDescription("Attempt a crime for coins and XP");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", flags: 64 });

  // Check jail or hospital status
  if (wallet.jailUntil && wallet.jailUntil > Date.now())
    return interaction.reply({ content: "🚔 You’re in jail! You can’t commit crimes.", flags: 64 });
  if (wallet.hospitalUntil && wallet.hospitalUntil > Date.now())
    return interaction.reply({ content: "🏥 You’re hospitalized and can’t act.", flags: 64 });

  const successChance = Math.max(30, 80 - wallet.warrants * 10); // lower with warrants
  const success = Math.random() * 100 < successChance;

  if (success) {
    const reward = Math.floor(Math.random() * 200) + 100;
    wallet.balance += reward;
    wallet.xp += 15;
    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("💵 Crime Success!")
      .setColor("Green")
      .setDescription(`You pulled off a crime and earned **${reward} coins** + ⭐ 15 XP!`)
      .setFooter({ text: `Warrants: ${wallet.warrants}` });

    return interaction.reply({ embeds: [embed] });
  } else {
    // Failure → raise warrants, chance of jail or hospital
    wallet.warrants = Math.min(wallet.warrants + 1, 5);
    let penalty = "";

    if (Math.random() < 0.5) {
      // Jail
      const jailTime = 1000 * 60 * 5; // 5 min
      wallet.jailUntil = new Date(Date.now() + jailTime);
      penalty = `🚔 You were caught and jailed for **5 minutes**.`;
    } else {
      // Hospital
      const hospitalTime = 1000 * 60 * 3; // 3 min
      wallet.hospitalUntil = new Date(Date.now() + hospitalTime);
      penalty = `💀 You were injured and hospitalized for **3 minutes**.`;
    }

    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("❌ Crime Failed!")
      .setColor("Red")
      .setDescription(`${penalty}\nYour warrants increased to **${wallet.warrants}**.`);

    return interaction.reply({ embeds: [embed] });
  }
}
