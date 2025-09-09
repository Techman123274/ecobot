import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("Bet coins on a 50/50 coin toss")
  .addStringOption(option =>
    option.setName("choice")
      .setDescription("Choose heads or tails")
      .setRequired(true)
      .addChoices(
        { name: "Heads", value: "heads" },
        { name: "Tails", value: "tails" }
      )
  )
  .addIntegerOption(option =>
    option.setName("amount").setDescription("Amount to bet").setRequired(true)
  );

export async function execute(interaction) {
  const choice = interaction.options.getString("choice");
  const amount = interaction.options.getInteger("amount");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }

  if (amount <= 0 || wallet.balance < amount) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  const outcome = Math.random() < 0.5 ? "heads" : "tails";
  let resultMsg;
  let color = "Red";

  if (choice === outcome) {
    wallet.balance += amount;
    resultMsg = `🎉 You won! The coin landed on **${outcome}**. You earned **${amount} coins**.`;
    color = "Green";
  } else {
    wallet.balance -= amount;
    resultMsg = `💀 You lost! The coin landed on **${outcome}**. You lost **${amount} coins**.`;
  }

  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🪙 Coinflip")
    .setDescription(resultMsg)
    .setColor(color);

  return interaction.reply({ embeds: [embed] });
}
