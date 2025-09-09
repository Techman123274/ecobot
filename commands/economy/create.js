import { SlashCommandBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("create")
  .setDescription("Create your wallet");

export async function execute(interaction) {
  const existing = await Wallet.findOne({ userId: interaction.user.id });
  if (existing) {
    return interaction.reply({ content: "⚠️ You already have a wallet!", ephemeral: true });
  }

  const wallet = new Wallet({ userId: interaction.user.id });
  await wallet.save();

  return interaction.reply(`✅ Wallet created! Balance: **${wallet.balance}** coins`);
}
