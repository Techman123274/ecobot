// commands/admin/admin.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
} from "discord.js";

import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";
import Territory from "../../src/database/Territory.js";
import PromoCode from "../../src/database/PromoCode.js";
// If you don't need these yet, remove them to satisfy linters
// import Business from "../../src/database/Business.js";
// import Property from "../../src/database/Property.js";
import { sendToJail, sendToHospital } from "../../utils/crimeSystem.js";

/* =========================
   CONFIG / SAFEGUARDS
   Adjust via env if needed
   ========================= */
const OWNER_ID = process.env.OWNER_ID || ""; // Optional hard lock

const MAX_ABS_DELTA = Number(process.env.ADMIN_MAX_ABS_DELTA ?? 1_000_000);       // Max +/- change at once
const MAX_SET_BALANCE = Number(process.env.ADMIN_MAX_SET_BALANCE ?? 10_000_000);  // Max absolute balance allowed
const MAX_PROMO_VALUE = Number(process.env.ADMIN_MAX_PROMO_VALUE ?? 100_000);
const MAX_PROMO_USES = Number(process.env.ADMIN_MAX_PROMO_USES ?? 1000);
const MAX_PROMO_DAYS = Number(process.env.ADMIN_MAX_PROMO_DAYS ?? 60);
const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID || ""; // Optional audit log channel

/* =========================
   HELPERS
   ========================= */
function isAllowed(interaction) {
  // Admins OR exact owner id if provided
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const isOwner = OWNER_ID && interaction.user.id === OWNER_ID;
  return Boolean(isAdmin || isOwner);
}

function ok(content, color = Colors.Green) {
  return new EmbedBuilder().setColor(color).setDescription(content);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ensureSafeInt(n) {
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) {
    throw new Error("INVALID_AMOUNT");
  }
}

async function logAction(interaction, action, details) {
  if (!ADMIN_LOG_CHANNEL_ID) return;
  try {
    const ch = await interaction.client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
    if (!ch || !ch.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`Admin: ${action}`)
      .setDescription(details)
      .setFooter({ text: `By ${interaction.user.tag} (${interaction.user.id})` })
      .setTimestamp(new Date());
    await ch.send({ embeds: [embed] });
  } catch {
    // swallow logging errors
  }
}

// Wallet defaults to ensure consistent shape on upsert
const WALLET_DEFAULTS = {
  cash: 0,
  bank: 0,
  warrants: 0,
  cooldowns: {},
  jailUntil: 0,
  hospitalUntil: 0,
  hospitalReason: "",
  isDead: false,
};

/* =========================
   SLASH COMMAND BUILDER
   ========================= */
export const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Admin-only actions for EcoBot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)

  // ===== economy =====
  .addSubcommandGroup(g =>
    g.setName("economy").setDescription("Wallet & bank controls")
      .addSubcommand(sc =>
        sc.setName("addcash")
          .setDescription("Add cash to a user's wallet.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Amount to add (1..${MAX_ABS_DELTA.toLocaleString()})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("setcash")
          .setDescription("Set a user's cash.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`New cash (0..${MAX_SET_BALANCE.toLocaleString()})`)
              .setRequired(true).setMinValue(0).setMaxValue(MAX_SET_BALANCE)
          )
      )
      .addSubcommand(sc =>
        sc.setName("addbank")
          .setDescription("Add bank balance to a user.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Amount to add (1..${MAX_ABS_DELTA.toLocaleString()})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("setbank")
          .setDescription("Set a user's bank balance.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`New bank (0..${MAX_SET_BALANCE.toLocaleString()})`)
              .setRequired(true).setMinValue(0).setMaxValue(MAX_SET_BALANCE)
          )
      )
      .addSubcommand(sc =>
        sc.setName("transfer")
          .setDescription("Transfer cash between users.")
          .addUserOption(o => o.setName("from").setDescription("From user").setRequired(true))
          .addUserOption(o => o.setName("to").setDescription("To user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Amount (1..${MAX_ABS_DELTA.toLocaleString()})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("reset")
          .setDescription("Reset user's cash & bank to 0.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
      )
  )

  // ===== crime =====
  .addSubcommandGroup(g =>
    g.setName("crime").setDescription("Warrants, jail & hospital")
      .addSubcommand(sc =>
        sc.setName("setwarrants")
          .setDescription("Set a user's warrants.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
          .addIntegerOption(o => o.setName("count").setDescription("New count").setRequired(true).setMinValue(0).setMaxValue(100))
      )
      .addSubcommand(sc =>
        sc.setName("clearwarrants")
          .setDescription("Clear a user's warrants.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("jail")
          .setDescription("Send user to jail (minutes).")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
          .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setRequired(true).setMinValue(1).setMaxValue(60 * 24))
      )
      .addSubcommand(sc =>
        sc.setName("free")
          .setDescription("Free user (clear jail/hospital).")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("hospital")
          .setDescription("Send user to hospital.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
          .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setRequired(true).setMinValue(1).setMaxValue(60 * 24))
          .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
      )
      .addSubcommand(sc =>
        sc.setName("revive")
          .setDescription("Revive a dead user.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
  )

  // ===== cooldowns & timers =====
  .addSubcommandGroup(g =>
    g.setName("cooldowns").setDescription("Clear user cooldowns")
      .addSubcommand(sc =>
        sc.setName("clear")
          .setDescription("Clear all or one command cooldown.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
          .addStringOption(o => o.setName("command").setDescription("Command name to clear").setRequired(false))
      )
  )

  // ===== user mgmt =====
  .addSubcommandGroup(g =>
    g.setName("user").setDescription("Wallet/user lifecycle")
      .addSubcommand(sc =>
        sc.setName("createwallet")
          .setDescription("Create wallet if missing.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("deletewallet")
          .setDescription("Delete a user's wallet (danger).")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("resetwallet")
          .setDescription("Reset wallet fields to defaults.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
  )

  // ===== gangs =====
  .addSubcommandGroup(g =>
    g.setName("gang").setDescription("Gang administration")
      .addSubcommand(sc =>
        sc.setName("setlevel")
          .setDescription("Set a gang's level.")
          .addStringOption(o => o.setName("gangid").setDescription("Gang ID").setRequired(true))
          .addIntegerOption(o => o.setName("level").setDescription("New level").setRequired(true).setMinValue(1).setMaxValue(100))
      )
      .addSubcommand(sc =>
        sc.setName("treasury")
          .setDescription("Adjust gang treasury.")
          .addStringOption(o => o.setName("gangid").setDescription("Gang ID").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Delta (-${MAX_ABS_DELTA.toLocaleString()}..${MAX_ABS_DELTA.toLocaleString()})`)
              .setRequired(true).setMinValue(-MAX_ABS_DELTA).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("disband")
          .setDescription("Disband a gang.")
          .addStringOption(o => o.setName("gangid").setDescription("Gang ID").setRequired(true))
      )
  )

  // ===== territory =====
  .addSubcommandGroup(g =>
    g.setName("territory").setDescription("Territory controls")
      .addSubcommand(sc =>
        sc.setName("transfer")
          .setDescription("Transfer territory ownership.")
          .addStringOption(o => o.setName("name").setDescription("Territory name").setRequired(true))
          .addStringOption(o => o.setName("gangid").setDescription("New owner gangId").setRequired(true))
          .addStringOption(o => o.setName("guildid").setDescription("Guild ID (if needed)").setRequired(true))
      )
  )

  // ===== promos =====
  .addSubcommandGroup(g =>
    g.setName("promo").setDescription("Promo codes")
      .addSubcommand(sc =>
        sc.setName("create")
          .setDescription("Create a promo code.")
          .addStringOption(o => o.setName("code").setDescription("PROMO123").setRequired(true))
          .addIntegerOption(o =>
            o.setName("value").setDescription(`Value (1..${MAX_PROMO_VALUE.toLocaleString()})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_PROMO_VALUE)
          )
          .addIntegerOption(o =>
            o.setName("maxuses").setDescription(`Max uses (1..${MAX_PROMO_USES})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_PROMO_USES)
          )
          .addIntegerOption(o =>
            o.setName("days").setDescription(`Expires in N days (1..${MAX_PROMO_DAYS})`)
              .setRequired(false).setMinValue(1).setMaxValue(MAX_PROMO_DAYS)
          )
      )
      .addSubcommand(sc =>
        sc.setName("delete")
          .setDescription("Delete a promo code.")
          .addStringOption(o => o.setName("code").setDescription("PROMO123").setRequired(true))
      )
  )

  // ===== utilities =====
  .addSubcommandGroup(g =>
    g.setName("util").setDescription("Utility actions")
      .addSubcommand(sc =>
        sc.setName("announce")
          .setDescription("Send an announcement embed to a channel.")
          .addChannelOption(o => o.setName("channel").setDescription("Target channel").setRequired(true))
          .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
          .addStringOption(o => o.setName("message").setDescription("Message").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("ping")
          .setDescription("Health check.")
      )
      .addSubcommand(sc =>
        sc.setName("debugwallet")
          .setDescription("Show raw wallet doc for a user.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
  );

/* =========================
   EXECUTE
   ========================= */
export async function execute(interaction) {
  if (!isAllowed(interaction)) {
    return interaction.reply({ content: "❌ Admins only.", ephemeral: true });
  }
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  try {
    // ===== economy =====
    if (group === "economy") {
      if (sub === "addcash") {
        const user = interaction.options.getUser("user", true);
        let amount = interaction.options.getInteger("amount", true);
        ensureSafeInt(amount);
        amount = clamp(amount, 1, MAX_ABS_DELTA);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $inc: { cash: amount } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "economy.addcash", `+${amount} to ${user.id} → cash=${after.cash}`);
        return interaction.reply({ embeds: [ok(`✅ Added **$${amount}** to ${user}\nNew cash: **$${after.cash}**`)], ephemeral: true });
      }

      if (sub === "setcash") {
        const user = interaction.options.getUser("user", true);
        let amount = interaction.options.getInteger("amount", true);
        ensureSafeInt(amount);
        amount = clamp(amount, 0, MAX_SET_BALANCE);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { cash: amount } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "economy.setcash", `set ${user.id} cash=${after.cash}`);
        return interaction.reply({ embeds: [ok(`✅ Cash set to **$${after.cash}** for ${user}`)], ephemeral: true });
      }

      if (sub === "addbank") {
        const user = interaction.options.getUser("user", true);
        let amount = interaction.options.getInteger("amount", true);
        ensureSafeInt(amount);
        amount = clamp(amount, 1, MAX_ABS_DELTA);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $inc: { bank: amount } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "economy.addbank", `+${amount} to ${user.id} → bank=${after.bank}`);
        return interaction.reply({ embeds: [ok(`✅ Added **$${amount}** bank to ${user}\nNew bank: **$${after.bank}**`)], ephemeral: true });
      }

      if (sub === "setbank") {
        const user = interaction.options.getUser("user", true);
        let amount = interaction.options.getInteger("amount", true);
        ensureSafeInt(amount);
        amount = clamp(amount, 0, MAX_SET_BALANCE);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { bank: amount } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "economy.setbank", `set ${user.id} bank=${after.bank}`);
        return interaction.reply({ embeds: [ok(`✅ Bank set to **$${after.bank}** for ${user}`)], ephemeral: true });
      }

      if (sub === "transfer") {
        const from = interaction.options.getUser("from", true);
        const to = interaction.options.getUser("to", true);
        let amount = interaction.options.getInteger("amount", true);
        ensureSafeInt(amount);
        amount = clamp(amount, 1, MAX_ABS_DELTA);

        const session = await mongoose.startSession();
        let recipientAfter;
        try {
          await session.withTransaction(async () => {
            // Deduct only if donor has enough, atomically
            const res = await Wallet.updateOne(
              { userId: from.id, cash: { $gte: amount } },
              { $inc: { cash: -amount }, $setOnInsert: { userId: from.id, ...WALLET_DEFAULTS } },
              { upsert: true, session }
            );
            if (res.matchedCount === 0) {
              throw new Error("INSUFFICIENT_FUNDS");
            }
            recipientAfter = await Wallet.findOneAndUpdate(
              { userId: to.id },
              { $inc: { cash: amount }, $setOnInsert: { userId: to.id, ...WALLET_DEFAULTS } },
              { upsert: true, new: true, session }
            );
          });
        } catch (e) {
          await session.endSession();
          if (e.message === "INSUFFICIENT_FUNDS") {
            return interaction.reply({ content: "❌ Donor has insufficient cash.", ephemeral: true });
          }
          throw e;
        }
        await session.endSession();

        await logAction(interaction, "economy.transfer", `${from.id} -> ${to.id} $${amount}`);
        return interaction.reply({
          embeds: [ok(`🔄 Transferred **$${amount}** from ${from} to ${to}.\n${to} new cash: **$${recipientAfter.cash}**`)],
          ephemeral: true,
        });
      }

      if (sub === "reset") {
        const user = interaction.options.getUser("user", true);
        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { cash: 0, bank: 0 } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "economy.reset", `reset ${user.id} cash/bank`);
        return interaction.reply({
          embeds: [ok(`🧹 Reset cash & bank for ${user}.\nCash: **$${after.cash}**, Bank: **$${after.bank}**`)],
          ephemeral: true,
        });
      }
    }

    // ===== crime =====
    if (group === "crime") {
      if (sub === "setwarrants") {
        const user = interaction.options.getUser("user", true);
        let count = interaction.options.getInteger("count", true);
        ensureSafeInt(count);
        count = clamp(count, 0, 100);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { warrants: count } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "crime.setwarrants", `${user.id} warrants=${after.warrants}`);
        return interaction.reply({
          embeds: [ok(`📝 Warrants for ${user}: **${after.warrants}**`, Colors.Orange)],
          ephemeral: true,
        });
      }

      if (sub === "clearwarrants") {
        const user = interaction.options.getUser("user", true);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { warrants: 0 } },
          { upsert: true, new: true }
        );

        await logAction(interaction, "crime.clearwarrants", `${user.id}`);
        return interaction.reply({
          embeds: [ok(`🧹 Cleared warrants for ${user}. Now **${after.warrants}**.`, Colors.Orange)],
          ephemeral: true,
        });
      }

      if (sub === "jail") {
        const user = interaction.options.getUser("user", true);
        let minutes = interaction.options.getInteger("minutes", true);
        ensureSafeInt(minutes);
        minutes = clamp(minutes, 1, 60 * 24);

        const w = (await Wallet.findOne({ userId: user.id })) || new Wallet({ userId: user.id, ...WALLET_DEFAULTS });
        const msg = await sendToJail(w, minutes); // helper saves internally
        await logAction(interaction, "crime.jail", `${user.id} for ${minutes}m`);
        return interaction.reply({ embeds: [ok(`🚔 ${user} ${msg}`, Colors.Red)], ephemeral: true });
      }

      if (sub === "free") {
        const user = interaction.options.getUser("user", true);

        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { jailUntil: 0, hospitalUntil: 0, hospitalReason: "" } },
          { upsert: true }
        );

        await logAction(interaction, "crime.free", `${user.id}`);
        return interaction.reply({ embeds: [ok(`🕊️ Freed ${user} (jail & hospital cleared).`)], ephemeral: true });
      }

      if (sub === "hospital") {
        const user = interaction.options.getUser("user", true);
        let minutes = interaction.options.getInteger("minutes", true);
        ensureSafeInt(minutes);
        minutes = clamp(minutes, 1, 60 * 24);
        const reason = interaction.options.getString("reason") || "Admin hospitalization";

        const w = (await Wallet.findOne({ userId: user.id })) || new Wallet({ userId: user.id, ...WALLET_DEFAULTS });
        const msg = await sendToHospital(w, minutes, reason); // helper saves internally
        await logAction(interaction, "crime.hospital", `${user.id} for ${minutes}m (${reason})`);
        return interaction.reply({ embeds: [ok(`🏥 ${user} ${msg}`, Colors.Red)], ephemeral: true });
      }

      if (sub === "revive") {
        const user = interaction.options.getUser("user", true);

        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { isDead: false } },
          { upsert: true }
        );

        await logAction(interaction, "crime.revive", `${user.id}`);
        return interaction.reply({ embeds: [ok(`❤️ Revived ${user}.`)], ephemeral: true });
      }
    }

    // ===== cooldowns =====
    if (group === "cooldowns") {
      if (sub === "clear") {
        const user = interaction.options.getUser("user", true);
        const cmd = interaction.options.getString("command");

        if (cmd) {
          await Wallet.updateOne({ userId: user.id }, { $unset: { [`cooldowns.${cmd}`]: "" } });
          await logAction(interaction, "cooldowns.clear", `${user.id} cmd=${cmd}`);
          return interaction.reply({ embeds: [ok(`⏳ Cleared \`${cmd}\` cooldown for ${user}.`)], ephemeral: true });
        } else {
          await Wallet.findOneAndUpdate(
            { userId: user.id },
            { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { cooldowns: {} } },
            { upsert: true }
          );
          await logAction(interaction, "cooldowns.clearall", `${user.id}`);
          return interaction.reply({ embeds: [ok(`⏳ Cleared **all** cooldowns for ${user}.`)], ephemeral: true });
        }
      }
    }

    // ===== user =====
    if (group === "user") {
      if (sub === "createwallet") {
        const user = interaction.options.getUser("user", true);
        const existing = await Wallet.findOne({ userId: user.id });
        if (existing) {
          return interaction.reply({ embeds: [ok(`ℹ️ Wallet already exists for ${user}.`, Colors.Blurple)], ephemeral: true });
        }

        await Wallet.create({ userId: user.id, ...WALLET_DEFAULTS });
        await logAction(interaction, "user.createwallet", `${user.id}`);
        return interaction.reply({ embeds: [ok(`✅ Created wallet for ${user}.`)], ephemeral: true });
      }

      if (sub === "deletewallet") {
        const user = interaction.options.getUser("user", true);
        await Wallet.deleteOne({ userId: user.id });
        await logAction(interaction, "user.deletewallet", `${user.id}`);
        return interaction.reply({ embeds: [ok(`🗑️ Deleted wallet for ${user}.`, Colors.Red)], ephemeral: true });
      }

      if (sub === "resetwallet") {
        const user = interaction.options.getUser("user", true);
        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { ...WALLET_DEFAULTS } },
          { upsert: true }
        );
        await logAction(interaction, "user.resetwallet", `${user.id}`);
        return interaction.reply({ embeds: [ok(`🔄 Reset wallet for ${user}.`)], ephemeral: true });
      }
    }

    // ===== gang =====
    if (group === "gang") {
      if (sub === "setlevel") {
        const gangId = interaction.options.getString("gangid", true);
        let level = interaction.options.getInteger("level", true);
        ensureSafeInt(level);
        level = clamp(level, 1, 100);

        await Gang.updateOne({ gangId }, { $set: { level } }, { upsert: true });
        await logAction(interaction, "gang.setlevel", `${gangId} level=${level}`);
        return interaction.reply({ embeds: [ok(`🛠️ Gang \`${gangId}\` level set to **${level}**.`)], ephemeral: true });
      }

      if (sub === "treasury") {
        const gangId = interaction.options.getString("gangid", true);
        let amount = interaction.options.getInteger("amount", true);
        ensureSafeInt(amount);
        amount = clamp(amount, -MAX_ABS_DELTA, MAX_ABS_DELTA);

        const after = await Gang.findOneAndUpdate(
          { gangId },
          { $setOnInsert: { gangId, treasury: 0, level: 1, active: true }, $inc: { treasury: amount } },
          { upsert: true, new: true }
        );
        await logAction(interaction, "gang.treasury", `${gangId} ${amount >= 0 ? "+" : ""}${amount} → ${after.treasury ?? 0}`);
        return interaction.reply({
          embeds: [ok(`💰 Gang \`${gangId}\` treasury adjusted by **$${amount}**.\nNew: **$${after.treasury ?? 0}**`)],
          ephemeral: true,
        });
      }

      if (sub === "disband") {
        const gangId = interaction.options.getString("gangid", true);
        await Gang.findOneAndUpdate(
          { gangId },
          { $setOnInsert: { gangId, treasury: 0, level: 1 }, $set: { active: false } },
          { upsert: true }
        );
        await logAction(interaction, "gang.disband", `${gangId}`);
        return interaction.reply({ embeds: [ok(`❌ Disbanded gang \`${gangId}\`.`, Colors.Red)], ephemeral: true });
      }
    }

    // ===== territory =====
    if (group === "territory") {
      if (sub === "transfer") {
        const name = interaction.options.getString("name", true);
        const gangId = interaction.options.getString("gangid", true);
        const guildId = interaction.options.getString("guildid", true);

        const after = await Territory.findOneAndUpdate(
          { guildId, name },
          { $setOnInsert: { guildId, name }, $set: { ownerGangId: gangId } },
          { upsert: true, new: true }
        );
        await logAction(interaction, "territory.transfer", `${name} -> ${gangId} (guild ${guildId})`);
        return interaction.reply({
          embeds: [ok(`🗺️ Territory **${after.name}** now owned by gang \`${gangId}\`.`)],
          ephemeral: true,
        });
      }
    }

    // ===== promo =====
    if (group === "promo") {
      if (sub === "create") {
        const code = interaction.options.getString("code", true).toUpperCase().replace(/\s+/g, "");
        let value = interaction.options.getInteger("value", true);
        let maxUses = interaction.options.getInteger("maxuses", true);
        let days = interaction.options.getInteger("days") ?? 14;

        ensureSafeInt(value); ensureSafeInt(maxUses); ensureSafeInt(days);
        value = clamp(value, 1, MAX_PROMO_VALUE);
        maxUses = clamp(maxUses, 1, MAX_PROMO_USES);
        days = clamp(days, 1, MAX_PROMO_DAYS);

        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await PromoCode.create({ code, value, maxUses, usedCount: 0, expiresAt, active: true });

        await logAction(interaction, "promo.create", `${code} value=${value} uses=${maxUses} days=${days}`);
        return interaction.reply({
          embeds: [ok(`🎁 Promo **${code}** created: value **$${value}**, maxUses **${maxUses}**, expires **${expiresAt.toDateString()}**`)],
          ephemeral: true,
        });
      }

      if (sub === "delete") {
        const code = interaction.options.getString("code", true).toUpperCase().trim();
        await PromoCode.deleteOne({ code });
        await logAction(interaction, "promo.delete", `${code}`);
        return interaction.reply({ embeds: [ok(`🗑️ Promo **${code}** deleted.`, Colors.Red)], ephemeral: true });
      }
    }

    // ===== util =====
    if (group === "util") {
      if (sub === "announce") {
        const channel = interaction.options.getChannel("channel", true);
        const title = interaction.options.getString("title", true);
        const message = interaction.options.getString("message", true);

        if (!channel?.isTextBased?.()) {
          return interaction.reply({ content: "❌ That channel isn't text-based.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(title)
          .setDescription(message)
          .setFooter({ text: `Announcement by ${interaction.user.tag}` })
          .setTimestamp(new Date());

        await channel.send({ embeds: [embed] });
        await logAction(interaction, "util.announce", `#${channel.id} "${title}"`);
        return interaction.reply({ content: "📣 Announcement sent.", ephemeral: true });
      }

      if (sub === "ping") {
        return interaction.reply({ embeds: [ok("🏓 Admin panel online.")], ephemeral: true });
      }

      if (sub === "debugwallet") {
        const user = interaction.options.getUser("user", true);
        const doc = await Wallet.findOne({ userId: user.id }).lean();
        const content = "```json\n" + JSON.stringify(doc ?? { note: "no wallet" }, null, 2) + "\n```";
        return interaction.reply({
          content: content.slice(0, 1995),
          ephemeral: true,
        });
      }
    }

    // fallback
    return interaction.reply({ content: "Unknown admin action.", ephemeral: true });
  } catch (err) {
    console.error("[/admin] error:", err);
    return interaction.reply({
      content: "❌ Something went wrong executing that admin action.",
      ephemeral: true,
    });
  }
}
