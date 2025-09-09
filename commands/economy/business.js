import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Business from "../../src/database/Business.js";
import Wallet from "../../src/database/Wallet.js";
import { BUSINESS_TYPES } from "../../config/economy.js";
import { runBusinessTick } from "../../utils/businessTick.js";
import { getOrCreateWallet, requireOwnerBusiness, ensureInventoryShape, shortId } from "../../utils/businessUtils.js";
const COOLDOWN_MS = 9 * 60 * 1000;
const lastMap = new Map();

export const data = new SlashCommandBuilder()
  .setName("business")
  .setDescription("Manage your business")
  .addSubcommand(sc => sc.setName("create").setDescription("Create a business")
    .addStringOption(o => {
      const opt = o.setName("type").setDescription("Business type").setRequired(true);
      Object.entries(BUSINESS_TYPES).forEach(([k,v]) => opt.addChoices({ name: v.display, value: k }));
      return opt;
    })
    .addStringOption(o => o.setName("name").setDescription("Business name").setRequired(true)))
  .addSubcommand(sc => sc.setName("work").setDescription("Run a work tick"))
  .addSubcommand(sc => sc.setName("hire").setDescription("Hire employee")
    .addStringOption(o => o.setName("role").setDescription("Role").setRequired(true))
    .addIntegerOption(o => o.setName("wage").setDescription("Wage per tick").setRequired(false)))
  .addSubcommand(sc => sc.setName("fire").setDescription("Fire employee")
    .addStringOption(o => o.setName("employee_id").setDescription("Employee ID").setRequired(true)))
  .addSubcommand(sc => sc.setName("order").setDescription("Order stock")
    .addStringOption(o => o.setName("sku").setDescription("Product SKU").setRequired(true))
    .addIntegerOption(o => o.setName("qty").setDescription("Quantity").setRequired(true)))
  .addSubcommand(sc => sc.setName("set-price").setDescription("Set SKU sell price")
    .addStringOption(o => o.setName("sku").setDescription("Product SKU").setRequired(true))
    .addIntegerOption(o => o.setName("price").setDescription("New price").setRequired(true)))
  .addSubcommand(sc => sc.setName("upgrade").setDescription("Upgrade business"))
  .addSubcommand(sc => sc.setName("stats").setDescription("View stats"))
  .addSubcommand(sc => sc.setName("employees").setDescription("List employees"))
  .addSubcommand(sc => sc.setName("inventory").setDescription("List inventory"));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // CREATE
  if (sub === "create") {
    const type = interaction.options.getString("type");
    const name = interaction.options.getString("name");
    const cfg = BUSINESS_TYPES[type];
    if (!cfg) return interaction.reply({ content: "❌ Unknown business type.", flags: MessageFlags.Ephemeral });

    const exists = await Business.findOne({ guildId: interaction.guildId, ownerId: interaction.user.id, isBankrupt: { $ne: true } });
    if (exists) return interaction.reply({ content: "❌ You already own a business.", flags: MessageFlags.Ephemeral });

    const wallet = await getOrCreateWallet(interaction.user.id);
    if (wallet.cash < cfg.startupCost) {
      return interaction.reply({ content: `❌ Need $${cfg.startupCost.toLocaleString()} cash.`, flags: MessageFlags.Ephemeral });
    }
    wallet.cash -= cfg.startupCost;
    await wallet.save();

    const biz = await Business.create({ guildId: interaction.guildId, ownerId: interaction.user.id, type, name, employees: [], inventory: [] });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("✅ Business Created").setDescription(`**${cfg.display}** — **${name}**\nUse \`/business hire\`, \`/business order\`, \`/business work\`.`).setColor(0x43b581)] });
  }

  // other subs need a business
  const biz = await requireOwnerBusiness(interaction.guildId, interaction.user.id).catch(() => null);
  if (!biz) return interaction.reply({ content: "❌ You don’t own a business.", flags: MessageFlags.Ephemeral });

  // WORK (cooldown)
  if (sub === "work") {
    const now = Date.now(), last = lastMap.get(interaction.user.id) || 0;
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return interaction.reply({ content: `⏳ Wait **${wait}s** before working again.`, flags: MessageFlags.Ephemeral });
    }
    ensureInventoryShape(biz);
    await biz.save();
    const r = await runBusinessTick(biz);
    lastMap.set(interaction.user.id, now);
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${biz.name} — Work Summary`)
      .setDescription([
        `Revenue: **$${(r.revenue||0).toLocaleString()}**`,
        `Wages: **$${(r.wages||0).toLocaleString()}**`,
        `Expenses: **$${(r.expenses||0).toLocaleString()}**`,
        `Event Impact: **$${(r.eventDelta||0).toLocaleString()}**`,
        `**Net:** $${(r.net||0).toLocaleString()}`,
        `Treasury: **$${biz.treasury.toLocaleString()}**, Debt: **$${biz.debt.toLocaleString()}**`,
        biz.isBankrupt ? "⚠️ **BANKRUPT**" : "",
      ].filter(Boolean).join("\n"))
      .setColor(biz.isBankrupt ? 0xff5555 : 0x7289da);
    return interaction.reply({ embeds: [embed] });
  }

  // HIRE
  if (sub === "hire") {
    const role = interaction.options.getString("role");
    const cfg = BUSINESS_TYPES[biz.type];
    if (!cfg.roles[role]) return interaction.reply({ content: "❌ Invalid role.", flags: MessageFlags.Ephemeral });
    const count = biz.employees.filter(e => e.role === role).length;
    if (count >= (cfg.roles[role].max ?? 99)) return interaction.reply({ content: "❌ Role cap reached.", flags: MessageFlags.Ephemeral });
    const wage = interaction.options.getInteger("wage") ?? cfg.roles[role].baseWage;
    const empId = shortId();
    biz.employees.push({ empId, role, wage, morale: 0.65, performance: 0.65 });
    await biz.save();
    return interaction.reply({ content: `👷 Hired **${role}** (ID: \`${empId}\`) at **$${wage}**/tick.` });
  }

  // FIRE
  if (sub === "fire") {
    const id = interaction.options.getString("employee_id");
    const idx = biz.employees.findIndex(e => e.empId === id);
    if (idx < 0) return interaction.reply({ content: "❌ Employee not found.", flags: MessageFlags.Ephemeral });
    const [emp] = biz.employees.splice(idx,1);
    await biz.save();
    return interaction.reply({ content: `📝 Fired **${emp.role}** (\`${emp.empId}\`).` });
  }

  // ORDER
  if (sub === "order") {
    const sku = interaction.options.getString("sku");
    const qty = Math.max(1, interaction.options.getInteger("qty") || 0);
    const cfg = BUSINESS_TYPES[biz.type];
    const sk = cfg.skus[sku];
    if (!sk) return interaction.reply({ content: "❌ Invalid SKU.", flags: MessageFlags.Ephemeral });
    ensureInventoryShape(biz);
    const inv = biz.inventory.find(i => i.sku === sku);
    const totalQty = biz.inventory.reduce((s,i)=>s+i.qty,0);
    if (totalQty + qty > cfg.stockCapacity) return interaction.reply({ content: `❌ Capacity exceeded. Max ${cfg.stockCapacity}.`, flags: MessageFlags.Ephemeral });
    const cost = qty * sk.unitCost;
    if (biz.treasury < cost) return interaction.reply({ content: `❌ Treasury needs $${cost.toLocaleString()}.`, flags: MessageFlags.Ephemeral });
    biz.treasury -= cost; inv.qty += qty;
    await biz.save();
    return interaction.reply({ content: `📦 Ordered **${sku} x${qty}** for **$${cost.toLocaleString()}**. Treasury: $${biz.treasury.toLocaleString()}` });
  }

  // SET PRICE
  if (sub === "set-price") {
    const sku = interaction.options.getString("sku");
    const price = Math.max(1, interaction.options.getInteger("price") || 0);
    const item = biz.inventory.find(i=>i.sku===sku);
    if (!item) return interaction.reply({ content: "❌ SKU not in inventory.", flags: MessageFlags.Ephemeral });
    item.sellPrice = price;
    await biz.save();
    return interaction.reply({ content: `✅ Set **${sku}** price to **$${price}**.` });
  }

  // UPGRADE
  if (sub === "upgrade") {
    const cfg = BUSINESS_TYPES[biz.type];
    const next = biz.level + 1;
    const cost = cfg.upgrade.price(next);
    if (biz.treasury < cost) return interaction.reply({ content: `❌ Treasury needs $${cost.toLocaleString()}.`, flags: MessageFlags.Ephemeral });
    biz.treasury -= cost; biz.level = next;
    await biz.save();
    return interaction.reply({ content: `⬆️ Upgraded to **Level ${biz.level}**.` });
  }

  // STATS / EMPLOYEES / INVENTORY
  if (sub === "stats") {
    const last = biz.history.slice(-6).map(h => `• ${h.type} ${h.delta>=0?'+':''}$${h.delta.toLocaleString()} — ${h.note}`).join("\n") || "No recent events.";
    const em = new EmbedBuilder()
      .setTitle(`${biz.name} — ${BUSINESS_TYPES[biz.type].display}`)
      .addFields(
        { name: "Level", value: String(biz.level), inline: true },
        { name: "Treasury", value: `$${biz.treasury.toLocaleString()}`, inline: true },
        { name: "Debt", value: `$${biz.debt.toLocaleString()}`, inline: true },
        { name: "Employees", value: String(biz.employees.length), inline: true },
        { name: "Inventory Qty", value: String(biz.inventory.reduce((s,i)=>s+i.qty,0)), inline: true },
      ).addFields({ name: "Recent", value: last }).setColor(0x7289da);
    return interaction.reply({ embeds: [em] });
  }

  if (sub === "employees") {
    const lines = biz.employees.map(e => `\`${e.empId}\` — **${e.role}** | Wage: $${e.wage} | Morale: ${(e.morale*100|0)}%`).join("\n") || "No employees.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("Employees").setDescription(lines).setColor(0x99aab5)] });
  }

  if (sub === "inventory") {
    const lines = biz.inventory.map(i => `**${i.name}** (\`${i.sku}\`) — Qty: ${i.qty} | Sell: $${i.sellPrice} | Cost: $${i.unitCost}`).join("\n") || "No inventory.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("Inventory").setDescription(lines).setColor(0x99aab5)] });
  }
}
