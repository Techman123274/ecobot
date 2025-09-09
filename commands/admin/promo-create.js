import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import PromoCode from "../../src/database/PromoCode.js";

export const data = new SlashCommandBuilder()
  .setName("promo")
  .setDescription("Manage promo codes (Admin only)")
  .addSubcommand(sub =>
    sub.setName("create")
      .setDescription("Create a new promo code")
      .addStringOption(opt => opt.setName("code").setDescription("Promo code").setRequired(true))
      .addIntegerOption(opt => opt.setName("coins").setDescription("Coins reward").setRequired(true))
      .addIntegerOption(opt => opt.setName("xp").setDescription("XP reward").setRequired(true))
      .addIntegerOption(opt => opt.setName("maxuses").setDescription("Max uses (0 = unlimited)").setRequired(true))
      .addStringOption(opt => opt.setName("expires").setDescription("Expiry date (YYYY-MM-DD)").setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName("list")
      .setDescription("List all promo codes")
  )
  .addSubcommand(sub =>
    sub.setName("delete")
      .setDescription("Delete a promo code")
      .addStringOption(opt => opt.setName("code").setDescription("Promo code").setRequired(true))
  );

export async function execute(interaction) {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({ content: "❌ You don’t have permission to use this.", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const code = interaction.options.getString("code").toUpperCase();
    const coins = interaction.options.getInteger("coins");
    const xp = interaction.options.getInteger("xp");
    const maxUses = interaction.options.getInteger("maxuses");
    const expiresInput = interaction.options.getString("expires");

    const expires = expiresInput ? new Date(expiresInput) : null;

    const promo = new PromoCode({ code, coins, xp, maxUses, expires });
    await promo.save();

    return interaction.reply(`✅ Promo code **${code}** created! Rewards: ${coins} coins, ${xp} XP.`);
  }

  if (sub === "list") {
    const promos = await PromoCode.find({});
    if (!promos.length) {
      return interaction.reply("📭 No promo codes found.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🎟️ Active Promo Codes")
      .setColor("Aqua");

    for (const promo of promos) {
      embed.addFields({
        name: promo.code,
        value: [
          `💰 Coins: ${promo.coins}`,
          `🪙 XP: ${promo.xp}`,
          `📦 Uses: ${promo.uses}/${promo.maxUses === 0 ? "♾️" : promo.maxUses}`,
          `⏳ Expires: ${promo.expires ? promo.expires.toDateString() : "Never"}`
        ].join("\n"),
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "delete") {
    const code = interaction.options.getString("code").toUpperCase();
    const promo = await PromoCode.findOneAndDelete({ code });

    if (!promo) {
      return interaction.reply({ content: "❌ Promo code not found.", ephemeral: true });
    }

    return interaction.reply(`🗑️ Promo code **${code}** has been deleted.`);
  }
}
