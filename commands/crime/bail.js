import { SlashCommandBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("bail")
  .setDescription("Pay bail to free a jailed user")
  .addUserOption(opt =>
    opt.setName("user").setDescription("The user to bail out").setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("user");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  const targetWallet = await Wallet.findOne({ userId: target.id });

  if (!wallet || !targetWallet) return interaction.reply({ content: "❌ Both users need wallets.", flags: 64 });

  if (!targetWallet.jailUntil || targetWallet.jailUntil < Date.now())
    return interaction.reply({ content: "✅ That user isn’t in jail.", flags: 64 });

  const bailCost = 300 + targetWallet.warrants * 100; // bail scales with warrants
  if (wallet.balance < bailCost)
    return interaction.reply({ content: `❌ Bail costs **${bailCost} coins**, but you don’t have enough.`, flags: 64 });

  wallet.balance -= bailCost;
  targetWallet.jailUntil = null;
  await wallet.save();
  await targetWallet.save();

  return interaction.reply(`💸 You paid **${bailCost} coins** to free <@${target.id}> from jail!`);
}
