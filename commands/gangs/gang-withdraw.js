import { SlashCommandBuilder, MessageFlags } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-withdraw")
  .setDescription("Withdraw money from your gang’s treasury (leader/eco only).")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Amount of cash to withdraw")
      .setRequired(true)
  );

export async function execute(interaction) {
  const amount = interaction.options.getInteger("amount");
  const userId = interaction.user.id;

  const wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet first.", flags: MessageFlags.Ephemeral });
  }

  const gang = await Gang.findOne({ "members.userId": userId });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  // check role
  const member = gang.members.find(m => m.userId === userId);
  if (!member || !["leader", "eco"].includes(member.role)) {
    return interaction.reply({ content: "❌ Only the Leader or Eco can withdraw from the treasury.", flags: MessageFlags.Ephemeral });
  }

  if (amount <= 0) {
    return interaction.reply({ content: "❌ Withdraw amount must be positive.", flags: MessageFlags.Ephemeral });
  }
  if (gang.treasury < amount) {
    return interaction.reply({ content: "❌ Treasury does not have enough funds.", flags: MessageFlags.Ephemeral });
  }

  // Transfer money from treasury → wallet
  gang.treasury -= amount;
  wallet.balance += amount;

  await gang.save();
  await wallet.save();

  return interaction.reply(
    `🏴 You withdrew 💵 $${amount.toLocaleString()} from **${gang.name}** treasury.\n` +
    `📦 Treasury Balance: $${gang.treasury.toLocaleString()}`
  );
}
