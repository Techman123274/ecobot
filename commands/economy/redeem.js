import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import PromoCode from "../../src/database/PromoCode.js";

export const data = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem a gift/promo code")
  .addStringOption(opt =>
    opt.setName("code").setDescription("Promo code").setRequired(true)
  );

export async function execute(interaction) {
  const codeInput = interaction.options.getString("code").toUpperCase();
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }

  const code = await PromoCode.findOne({ code: codeInput });
  if (!code) {
    return interaction.reply({ content: "❌ Invalid code.", ephemeral: true });
  }

  // Check expiry
  if (code.expires && new Date() > code.expires) {
    return interaction.reply({ content: "⏳ This code has expired.", ephemeral: true });
  }

  // Prevent multiple claims per user
  wallet.redeemedCodes = wallet.redeemedCodes || [];
  if (wallet.redeemedCodes.includes(codeInput)) {
    return interaction.reply({ content: "❌ You already redeemed this code.", ephemeral: true });
  }

  // Check max uses
  if (code.maxUses > 0 && code.uses >= code.maxUses) {
    return interaction.reply({ content: "❌ This code has already been fully claimed.", ephemeral: true });
  }

  // Apply rewards
  wallet.balance += code.coins;
  wallet.xp += code.xp;
  wallet.redeemedCodes.push(codeInput);
  await wallet.save();

  // Update code usage
  code.uses += 1;
  await code.save();

  const embed = new EmbedBuilder()
    .setTitle("🎟️ Promo Code Redeemed")
    .setColor("Green")
    .setDescription(`You successfully redeemed **${code.code}**!`)
    .addFields(
      { name: "Coins", value: `💰 ${code.coins.toLocaleString()}`, inline: true },
      { name: "XP", value: `🪙 ${code.xp}`, inline: true },
      { name: "Remaining Uses", value: code.maxUses === 0 ? "♾️ Unlimited" : `${code.maxUses - code.uses}`, inline: true }
    )
    .setFooter({ text: `Redeemed on ${new Date().toLocaleString()}` });

  return interaction.reply({ embeds: [embed] });
}
