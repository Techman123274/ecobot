// commands/business/business.js
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Business from "../../src/database/Business.js";
import Wallet from "../../src/database/Wallet.js";
import { BUSINESS_TYPES } from "../../config/economy.js";
import { runBusinessTick } from "../../utils/businessTick.js";
import {
  getOrCreateWallet,
  requireOwnerBusiness,
  ensureInventoryShape,
  shortId,
} from "../../utils/businessUtils.js";

const COOLDOWN_MS = 9 * 60 * 1000;
// cooldown per user per guild
const lastMap = new Map(); // key: `${guildId}:${userId}`

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

export const data = new SlashCommandBuilder()
  .setName("business")
  .setDescription("Manage your business")
  .addSubcommand((sc) =>
    sc
      .setName("create")
      .setDescription("Create a business")
      .addStringOption((o) => {
        const opt = o
          .setName("type")
          .setDescription("Business type")
          .setRequired(true);
        Object.entries(BUSINESS_TYPES).forEach(([k, v]) =>
          opt.addChoices({ name: v.display, value: k })
        );
        return opt;
      })
      .addStringOption((o) =>
        o.setName("name").setDescription("Business name").setRequired(true)
      )
  )
  .addSubcommand((sc) => sc.setName("work").setDescription("Run a work tick"))
  .addSubcommand((sc) =>
    sc
      .setName("hire")
      .setDescription("Hire employee")
      .addStringOption((o) =>
        o.setName("role").setDescription("Role").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("wage")
          .setDescription("Wage per tick (optional)")
          .setRequired(false)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("fire")
      .setDescription("Fire employee")
      .addStringOption((o) =>
        o
          .setName("employee_id")
          .setDescription("Employee ID")
          .setRequired(true)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("order")
      .setDescription("Order stock")
      .addStringOption((o) =>
        o.setName("sku").setDescription("Product SKU").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("qty").setDescription("Quantity").setRequired(true)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("set-price")
      .setDescription("Set SKU sell price")
      .addStringOption((o) =>
        o.setName("sku").setDescription("Product SKU").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("price").setDescription("New price").setRequired(true)
      )
  )
  .addSubcommand((sc) => sc.setName("upgrade").setDescription("Upgrade business"))
  .addSubcommand((sc) => sc.setName("stats").setDescription("View stats"))
  .addSubcommand((sc) =>
    sc.setName("employees").setDescription("List employees")
  )
  .addSubcommand((sc) =>
    sc.setName("inventory").setDescription("List inventory")
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // CREATE
  if (sub === "create") {
    const type = interaction.options.getString("type");
    const name = interaction.options.getString("name");
    const cfg = BUSINESS_TYPES[type];

    if (!cfg) {
      return interaction.reply({
        content: "❌ Unknown business type.",
        ephemeral: true,
      });
    }

    const exists = await Business.findOne({
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      isBankrupt: { $ne: true },
    });
    if (exists) {
      return interaction.reply({
        content: "❌ You already own a business.",
        ephemeral: true,
      });
    }

    const wallet = await getOrCreateWallet(interaction.user.id);
    const startup = Number(cfg.startupCost || 0);
    if ((wallet.balance ?? 0) < startup) {
      return interaction.reply({
        content: `❌ Need ${money(startup)} in your balance.`,
        ephemeral: true,
      });
    }

    // atomic decrement
    await Wallet.updateOne(
      { userId: interaction.user.id },
      { $inc: { balance: -startup } }
    );

    const biz = await Business.create({
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      type,
      name,
      level: 1,
      treasury: cfg.initialTreasury ?? 0,
      debt: 0,
      employees: [],
      inventory: [],
      history: [],
      isBankrupt: false,
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Business Created")
      .setColor(0x43b581)
      .setDescription(
        `**${cfg.display}** — **${name}**\n` +
          `Startup Cost: ${money(startup)}\n` +
          `Use \`/business hire\`, \`/business order\`, \`/business work\`.`
      );

    return interaction.reply({ embeds: [embed] });
  }

  // All other subs require an owned business
  const biz =
    (await requireOwnerBusiness(
      interaction.guildId,
      interaction.user.id
    ).catch(() => null)) || null;

  if (!biz) {
    return interaction.reply({
      content: "❌ You don’t own a business.",
      ephemeral: true,
    });
  }

  // WORK
  if (sub === "work") {
    const key = `${interaction.guildId}:${interaction.user.id}`;
    const now = Date.now();
    const last = lastMap.get(key) || 0;
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return interaction.reply({
        content: `⏳ Wait **${wait}s** before working again.`,
        ephemeral: true,
      });
    }

    ensureInventoryShape(biz);
    await biz.save();

    const r = await runBusinessTick(biz); // should mutate biz.treasury/debt/history/etc
    lastMap.set(key, now);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${biz.name} — Work Summary`)
      .setColor(biz.isBankrupt ? 0xff5555 : 0x7289da)
      .setDescription(
        [
          `Revenue: **${money(r.revenue || 0)}**`,
          `Wages: **${money(r.wages || 0)}**`,
          `Expenses: **${money(r.expenses || 0)}**`,
          `Event Impact: **${money(r.eventDelta || 0)}**`,
          `**Net:** ${money(r.net || 0)}`,
          `Treasury: **${money(biz.treasury)}**, Debt: **${money(biz.debt)}**`,
          biz.isBankrupt ? "⚠️ **BANKRUPT**" : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

    return interaction.reply({ embeds: [embed] });
  }

  // HIRE
  if (sub === "hire") {
    const role = interaction.options.getString("role");
    const cfg = BUSINESS_TYPES[biz.type];

    if (!cfg?.roles?.[role]) {
      return interaction.reply({
        content: "❌ Invalid role.",
        ephemeral: true,
      });
    }

    const count = biz.employees.filter((e) => e.role === role).length;
    const cap = cfg.roles[role].max ?? 99;
    if (count >= cap) {
      return interaction.reply({
        content: "❌ Role cap reached.",
        ephemeral: true,
      });
    }

    const wage = interaction.options.getInteger("wage") ?? cfg.roles[role].baseWage ?? 0;
    const empId = shortId();

    biz.employees.push({
      empId,
      role,
      wage,
      morale: 0.65,
      performance: 0.65,
    });

    await biz.save();

    return interaction.reply({
      content: `👷 Hired **${role}** (ID: \`${empId}\`) at **${money(wage)}**/tick.`,
    });
  }

  // FIRE
  if (sub === "fire") {
    const id = interaction.options.getString("employee_id");
    const idx = biz.employees.findIndex((e) => e.empId === id);
    if (idx < 0) {
      return interaction.reply({
        content: "❌ Employee not found.",
        ephemeral: true,
      });
    }
    const [emp] = biz.employees.splice(idx, 1);
    await biz.save();

    return interaction.reply({
      content: `📝 Fired **${emp.role}** (\`${emp.empId}\`).`,
    });
  }

  // ORDER
  if (sub === "order") {
    const sku = interaction.options.getString("sku");
    const qty = Math.max(1, interaction.options.getInteger("qty") || 0);
    const cfg = BUSINESS_TYPES[biz.type];
    const sk = cfg?.skus?.[sku];

    if (!sk) {
      return interaction.reply({
        content: "❌ Invalid SKU.",
        ephemeral: true,
      });
    }

    ensureInventoryShape(biz);
    let inv = biz.inventory.find((i) => i.sku === sku);
    if (!inv) {
      inv = {
        sku,
        name: sk.display ?? sku,
        qty: 0,
        unitCost: sk.unitCost ?? 0,
        sellPrice: sk.sellPrice ?? Math.ceil((sk.unitCost || 1) * 1.5),
      };
      biz.inventory.push(inv);
    }

    const totalQty = biz.inventory.reduce((s, i) => s + (i.qty || 0), 0);
    const cap = cfg.stockCapacity ?? 999999;
    if (totalQty + qty > cap) {
      return interaction.reply({
        content: `❌ Capacity exceeded. Max ${cap}.`,
        ephemeral: true,
      });
    }

    const cost = qty * (sk.unitCost ?? inv.unitCost ?? 0);
    if (biz.treasury < cost) {
      return interaction.reply({
        content: `❌ Treasury needs ${money(cost)}.`,
        ephemeral: true,
      });
    }

    biz.treasury -= cost;
    inv.qty += qty;
    await biz.save();

    return interaction.reply({
      content: `📦 Ordered **${sku} x${qty}** for **${money(cost)}**. Treasury: ${money(
        biz.treasury
      )}`,
    });
  }

  // SET PRICE
  if (sub === "set-price") {
    const sku = interaction.options.getString("sku");
    const price = Math.max(1, interaction.options.getInteger("price") || 0);
    const item = biz.inventory.find((i) => i.sku === sku);
    if (!item) {
      return interaction.reply({
        content: "❌ SKU not in inventory.",
        ephemeral: true,
      });
    }
    item.sellPrice = price;
    await biz.save();
    return interaction.reply({
      content: `✅ Set **${sku}** price to **${money(price)}**.`,
    });
  }

  // UPGRADE
  if (sub === "upgrade") {
    const cfg = BUSINESS_TYPES[biz.type];
    const next = (biz.level || 1) + 1;
    const priceFn = cfg?.upgrade?.price;
    const cost = typeof priceFn === "function" ? Number(priceFn(next)) : Number(cfg?.upgradeCost || 0);

    if (biz.treasury < cost) {
      return interaction.reply({
        content: `❌ Treasury needs ${money(cost)}.`,
        ephemeral: true,
      });
    }

    biz.treasury -= cost;
    biz.level = next;
    await biz.save();

    return interaction.reply({
      content: `⬆️ Upgraded to **Level ${biz.level}**.`,
    });
  }

  // STATS
  if (sub === "stats") {
    const recent =
      (biz.history || [])
        .slice(-6)
        .map(
          (h) =>
            `• ${h.type} ${h.delta >= 0 ? "+" : ""}${money(h.delta)} — ${h.note || ""}`
        )
        .join("\n") || "No recent events.";

    const em = new EmbedBuilder()
      .setTitle(`${biz.name} — ${BUSINESS_TYPES[biz.type]?.display || biz.type}`)
      .addFields(
        { name: "Level", value: String(biz.level || 1), inline: true },
        { name: "Treasury", value: money(biz.treasury), inline: true },
        { name: "Debt", value: money(biz.debt), inline: true },
        { name: "Employees", value: String(biz.employees?.length || 0), inline: true },
        {
          name: "Inventory Qty",
          value: String(biz.inventory?.reduce((s, i) => s + (i.qty || 0), 0) || 0),
          inline: true,
        },
      )
      .addFields({ name: "Recent", value: recent })
      .setColor(0x7289da);

    return interaction.reply({ embeds: [em] });
  }

  // EMPLOYEES
  if (sub === "employees") {
    const lines =
      (biz.employees || [])
        .map(
          (e) =>
            `\`${e.empId}\` — **${e.role}** | Wage: ${money(e.wage)} | Morale: ${Math.floor(
              (e.morale || 0) * 100
            )}%`
        )
        .join("\n") || "No employees.";

    return interaction.reply({
      embeds: [
        new EmbedBuilder().setTitle("Employees").setDescription(lines).setColor(0x99aab5),
      ],
    });
  }

  // INVENTORY
  if (sub === "inventory") {
    const lines =
      (biz.inventory || [])
        .map(
          (i) =>
            `**${i.name || i.sku}** (\`${i.sku}\`) — Qty: ${i.qty || 0} | Sell: ${money(
              i.sellPrice || 0
            )} | Cost: ${money(i.unitCost || 0)}`
        )
        .join("\n") || "No inventory.";

    return interaction.reply({
      embeds: [
        new EmbedBuilder().setTitle("Inventory").setDescription(lines).setColor(0x99aab5),
      ],
    });
  }
}
