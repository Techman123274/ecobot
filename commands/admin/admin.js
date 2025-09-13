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
import { sendToJail, sendToHospital } from "../../utils/crimeSystem.js";

/* =========================
   CONFIG / SAFEGUARDS
   ========================= */
const OWNER_ID = process.env.OWNER_ID || "";
const MAX_ABS_DELTA = Number(process.env.ADMIN_MAX_ABS_DELTA ?? 1_000_000);
const MAX_SET_BALANCE = Number(process.env.ADMIN_MAX_SET_BALANCE ?? 10_000_000);
const MAX_PROMO_VALUE = Number(process.env.ADMIN_MAX_PROMO_VALUE ?? 100_000);
const MAX_PROMO_USES = Number(process.env.ADMIN_MAX_PROMO_USES ?? 1000);
const MAX_PROMO_DAYS = Number(process.env.ADMIN_MAX_PROMO_DAYS ?? 60);
const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID || "";

/* =========================
   HELPERS
   ========================= */
function isAllowed(interaction) {
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
  } catch { }
}

// Wallet defaults
const WALLET_DEFAULTS = {
  balance: 0,
  bank: 0,
  warrants: 0,
  jailUntil: null,
  hospitalUntil: null,
  hospitalReason: null,
  snitched: false,
  xp: 0,
  level: 1,
};

/* =========================
   SLASH COMMAND BUILDER
   ========================= */
export const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Admin-only actions for EcoBot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)

  // === economy ===
  .addSubcommandGroup(g =>
    g.setName("economy").setDescription("Wallet & bank controls")
      .addSubcommand(sc =>
        sc.setName("addcash")
          .setDescription("Add balance to a user's wallet.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Amount (1..${MAX_ABS_DELTA})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("setcash")
          .setDescription("Set a user's balance.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`New balance (0..${MAX_SET_BALANCE})`)
              .setRequired(true).setMinValue(0).setMaxValue(MAX_SET_BALANCE)
          )
      )
      .addSubcommand(sc =>
        sc.setName("addbank")
          .setDescription("Add bank balance to a user.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Amount (1..${MAX_ABS_DELTA})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("setbank")
          .setDescription("Set a user's bank balance.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`New bank (0..${MAX_SET_BALANCE})`)
              .setRequired(true).setMinValue(0).setMaxValue(MAX_SET_BALANCE)
          )
      )
      .addSubcommand(sc =>
        sc.setName("transfer")
          .setDescription("Transfer balance between users.")
          .addUserOption(o => o.setName("from").setDescription("From user").setRequired(true))
          .addUserOption(o => o.setName("to").setDescription("To user").setRequired(true))
          .addIntegerOption(o =>
            o.setName("amount").setDescription(`Amount (1..${MAX_ABS_DELTA})`)
              .setRequired(true).setMinValue(1).setMaxValue(MAX_ABS_DELTA)
          )
      )
      .addSubcommand(sc =>
        sc.setName("reset")
          .setDescription("Reset user's balance & bank to 0.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
      )
  )

  // === crime ===
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
          .setDescription("Revive a hospitalized/jail user.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
  )

  // === cooldowns ===
  .addSubcommandGroup(g =>
    g.setName("cooldowns").setDescription("Clear user cooldowns")
      .addSubcommand(sc =>
        sc.setName("clear")
          .setDescription("Clear all or one command cooldown.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
          .addStringOption(o => o.setName("command").setDescription("Command name to clear").setRequired(false))
      )
  )

  // === user mgmt ===
  .addSubcommandGroup(g =>
    g.setName("user").setDescription("Wallet/user lifecycle")
      .addSubcommand(sc =>
        sc.setName("createwallet")
          .setDescription("Create wallet if missing.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("deletewallet")
          .setDescription("Delete a user's wallet.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("resetwallet")
          .setDescription("Reset wallet fields to defaults.")
          .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      )
  );


// ===== EXECUTE =====
export async function execute(interaction) {
  if (!isAllowed(interaction)) {
    return interaction.reply({ content: "❌ Admins only.", ephemeral: true });
  }
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  try {
    // economy (already shown earlier)...

    // crime
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
        return interaction.reply({ embeds: [ok(`📝 Warrants for ${user}: **${after.warrants}**`, Colors.Orange)], ephemeral: true });
      }

      if (sub === "clearwarrants") {
        const user = interaction.options.getUser("user", true);
        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { warrants: 0 } },
          { upsert: true, new: true }
        );
        await logAction(interaction, "crime.clearwarrants", `${user.id}`);
        return interaction.reply({ embeds: [ok(`🧹 Cleared warrants for ${user}.`, Colors.Orange)], ephemeral: true });
      }

      if (sub === "jail") {
        const user = interaction.options.getUser("user", true);
        let minutes = interaction.options.getInteger("minutes", true);
        ensureSafeInt(minutes);
        minutes = clamp(minutes, 1, 60 * 24);

        const wallet = await Wallet.findOne({ userId: user.id }) || new Wallet({ userId: user.id, ...WALLET_DEFAULTS });
        const msg = await sendToJail(wallet, minutes);
        await logAction(interaction, "crime.jail", `${user.id} ${minutes}m`);
        return interaction.reply({ embeds: [ok(`🚔 ${user} ${msg}`, Colors.Red)], ephemeral: true });
      }

      if (sub === "free") {
        const user = interaction.options.getUser("user", true);
        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $set: { jailUntil: null, hospitalUntil: null, hospitalReason: null } },
          { upsert: true }
        );
        await logAction(interaction, "crime.free", `${user.id}`);
        return interaction.reply({ embeds: [ok(`🕊️ Freed ${user}.`)], ephemeral: true });
      }

      if (sub === "hospital") {
        const user = interaction.options.getUser("user", true);
        let minutes = interaction.options.getInteger("minutes", true);
        ensureSafeInt(minutes);
        minutes = clamp(minutes, 1, 60 * 24);
        const reason = interaction.options.getString("reason") || "Admin hospitalization";

        const wallet = await Wallet.findOne({ userId: user.id }) || new Wallet({ userId: user.id, ...WALLET_DEFAULTS });
        const msg = await sendToHospital(wallet, minutes, reason);
        await logAction(interaction, "crime.hospital", `${user.id} ${minutes}m (${reason})`);
        return interaction.reply({ embeds: [ok(`🏥 ${user} ${msg}`, Colors.Red)], ephemeral: true });
      }

      if (sub === "revive") {
        const user = interaction.options.getUser("user", true);
        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $set: { jailUntil: null, hospitalUntil: null, hospitalReason: null } },
          { upsert: true }
        );
        await logAction(interaction, "crime.revive", `${user.id}`);
        return interaction.reply({ embeds: [ok(`❤️ Revived ${user}.`)], ephemeral: true });
      }
    }

    // cooldowns / user mgmt stay the same, just no `isDead`

    return interaction.reply({ content: "Unknown admin action.", ephemeral: true });
  } catch (err) {
    console.error("[/admin] error:", err);
    return interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
  }
}
