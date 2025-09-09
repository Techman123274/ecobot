// commands/crime/hospital.js
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("hospital")
  .setDescription("Hospital system")
  .addSubcommand(sub =>
    sub
      .setName("status")
      .setDescription("Check your hospital status")
  )
  .addSubcommand(sub =>
    sub
      .setName("pay")
      .setDescription("Pay to leave the hospital early")
      .addIntegerOption(opt =>
        opt.setName("amount")
          .setDescription("Coins you are willing to pay (min 500)")
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", flags: 64 });
  }

  if (sub === "status") {
    if (wallet.hospitalUntil && wallet.hospitalUntil > Date.now()) {
      const remaining = Math.ceil((wallet.hospitalUntil - Date.now()) / 60000);
      const embed = new EmbedBuilder()
        .setTitle("🏥 Hospital Status")
        .setColor("Yellow")
        .setDescription(
          `You are recovering in the hospital.\n` +
          `⏳ Time left: **${remaining} minutes**\n` +
          (wallet.hospitalReason ? `📋 Reason: *${wallet.hospitalReason}*` : "")
        );
      return interaction.reply({ embeds: [embed] });
    }
    return interaction.reply("✅ You’re not in the hospital right now.");
  }

  if (sub === "pay") {
    if (!wallet.hospitalUntil || wallet.hospitalUntil <= Date.now()) {
      return interaction.reply({ content: "✅ You’re not in the hospital right now.", flags: 64 });
    }

    const amount = interaction.options.getInteger("amount");
    if (amount < 500) {
      return interaction.reply({ content: "❌ Minimum hospital payment is **500 coins**.", flags: 64 });
    }
    if (wallet.balance < amount) {
      return interaction.reply({ content: "❌ You don’t have enough coins to pay.", flags: 64 });
    }

    // Deduct coins & free user
    wallet.balance -= amount;
    wallet.hospitalUntil = null;
    wallet.hospitalReason = null;
    await wallet.save();

    return interaction.reply(
      `💸 You paid **${amount} coins** to the hospital and were released early. Take care out there!`
    );
  }
}
