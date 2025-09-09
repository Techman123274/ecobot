import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Property from "../../src/database/Property.js";
import Wallet from "../../src/database/Wallet.js";
import { PROPERTY_CATALOG } from "../../config/economy.js";

export const data = new SlashCommandBuilder()
  .setName("property")
  .setDescription("Real estate")
  .addSubcommand(sc => sc.setName("buy").setDescription("Buy property")
    .addStringOption(o => {
      const opt = o.setName("type").setDescription("Type").setRequired(true);
      Object.keys(PROPERTY_CATALOG).forEach(k => opt.addChoices({ name: k, value: k }));
      return opt;
    })
    .addStringOption(o => o.setName("name").setDescription("Property name").setRequired(true)))
  .addSubcommand(sc => sc.setName("list").setDescription("List your properties"))
  .addSubcommand(sc => sc.setName("upgrade").setDescription("Upgrade property")
    .addStringOption(o => o.setName("name").setDescription("Property name").setRequired(true)))
  .addSubcommand(sc => sc.setName("sell").setDescription("Sell property")
    .addStringOption(o => o.setName("name").setDescription("Property name").setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "buy") {
    const type = interaction.options.getString("type");
    const name = interaction.options.getString("name");
    const cfg = PROPERTY_CATALOG[type];
    if (!cfg) return interaction.reply({ content: "❌ Invalid type.", flags: MessageFlags.Ephemeral });

    const wallet = await Wallet.findOne({ userId: interaction.user.id });
    if (!wallet || wallet.cash < cfg.baseValue) {
      return interaction.reply({ content: `❌ Need $${cfg.baseValue.toLocaleString()} cash.`, flags: MessageFlags.Ephemeral });
    }
    wallet.cash -= cfg.baseValue; await wallet.save();

    await Property.create({
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      type, name,
      baseValue: cfg.baseValue,
      maintenancePerTick: cfg.maintenancePerTick,
      passivePerTick: cfg.passivePerTick,
    });

    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏠 Property Purchased").setDescription(`Type **${type}** — **${name}**`).setColor(0x43b581)] });
  }

  if (sub === "list") {
    const props = await Property.find({ guildId: interaction.guildId, ownerId: interaction.user.id });
    const lines = props.map(p => `**${p.name}** (${p.type}) — L${p.level} — Value $${p.baseValue.toLocaleString()} — Passive/tick $${p.passivePerTick}`).join("\n") || "You own no properties.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("Your Properties").setDescription(lines).setColor(0x7289da)] });
  }

  const name = interaction.options.getString("name");
  const prop = await Property.findOne({ guildId: interaction.guildId, ownerId: interaction.user.id, name });
  if (!prop) return interaction.reply({ content: "❌ Property not found.", flags: MessageFlags.Ephemeral });

  if (sub === "upgrade") {
    // basic: increase value & passive; you can charge wallet or business treasury if you want
    prop.level += 1;
    prop.baseValue = Math.floor(prop.baseValue * 1.1);
    prop.passivePerTick = Math.floor(prop.passivePerTick * 1.2);
    await prop.save();
    return interaction.reply({ content: `⬆️ Upgraded **${prop.name}** to L${prop.level}.` });
  }

  if (sub === "sell") {
    const refund = Math.floor(prop.baseValue * 0.8);
    await prop.deleteOne();
    // NOTE: add refund to wallet if desired:
    // const w = await Wallet.findOne({ userId: interaction.user.id }); w.cash += refund; await w.save();
    return interaction.reply({ content: `✅ Sold **${name}** for $${refund.toLocaleString()}.` });
  }
}
