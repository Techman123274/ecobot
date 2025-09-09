// commands/admin/admin.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  Colors,
} from "discord.js";

import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";
import Territory from "../../src/database/Territory.js";
import PromoCode from "../../src/database/PromoCode.js";
// Keeping these imports if you expand later; remove if unused to satisfy linters
import Business from "../../src/database/Business.js";
import Property from "../../src/database/Property.js";
import { sendToJail, sendToHospital } from "../../utils/crimeSystem.js";

const OWNER_ID = process.env.OWNER_ID || ""; // optional extra lock

function isAllowed(interaction) {
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const isOwner = OWNER_ID && interaction.user.id === OWNER_ID;
  return Boolean(isAdmin || isOwner);
}

function ok(content, color = Colors.Green) {
  return new EmbedBuilder().setColor(color).setDescription(content);
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
          .addIntegerOption(o => o.setName("amount").setDescription("Amount to add").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("setcash")
          .setDescription("Set a user's cash.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o => o.setName("amount").setDescription("New cash").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("addbank")
          .setDescription("Add bank balance to a user.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o => o.setName("amount").setDescription("Amount to add").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("setbank")
          .setDescription("Set a user's bank balance.")
          .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
          .addIntegerOption(o => o.setName("amount").setDescription("New bank").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("transfer")
          .setDescription("Transfer cash between users.")
          .addUserOption(o => o.setName("from").setDescription("From user").setRequired(true))
          .addUserOption(o => o.setName("to").setDescription("To user").setRequired(true))
          .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
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
          .addIntegerOption(o => o.setName("count").setDescription("New count").setRequired(true))
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
          .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setRequired(true))
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
          .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setRequired(true))
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
          .addIntegerOption(o => o.setName("level").setDescription("New level").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("treasury")
          .setDescription("Adjust gang treasury.")
          .addStringOption(o => o.setName("gangid").setDescription("Gang ID").setRequired(true))
          .addIntegerOption(o => o.setName("amount").setDescription("Positive or negative").setRequired(true))
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
          .addIntegerOption(o => o.setName("value").setDescription("Value (coins)").setRequired(true))
          .addIntegerOption(o => o.setName("maxuses").setDescription("Max uses").setRequired(true))
          .addIntegerOption(o => o.setName("days").setDescription("Expires in N days").setRequired(false))
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

export async function execute(interaction) {
  if (!isAllowed(interaction)) {
    return interaction.reply({ content: "❌ Admins only.", flags: MessageFlags.Ephemeral });
  }
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  try {
    // ===== economy =====
    if (group === "economy") {
      if (sub === "addcash") {
        const user = interaction.options.getUser("user", true);
        const amount = interaction.options.getInteger("amount", true);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          {
            $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS },
            $inc: { cash: amount },
          },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`✅ Added **$${amount}** to ${user}\nNew cash: **$${after.cash}**`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "setcash") {
        const user = interaction.options.getUser("user", true);
        const amount = Math.max(0, interaction.options.getInteger("amount", true));

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          {
            $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS },
            $set: { cash: amount },
          },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`✅ Cash set to **$${after.cash}** for ${user}`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "addbank") {
        const user = interaction.options.getUser("user", true);
        const amount = interaction.options.getInteger("amount", true);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          {
            $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS },
            $inc: { bank: amount },
          },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`✅ Added **$${amount}** bank to ${user}\nNew bank: **$${after.bank}**`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "setbank") {
        const user = interaction.options.getUser("user", true);
        const amount = Math.max(0, interaction.options.getInteger("amount", true));

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          {
            $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS },
            $set: { bank: amount },
          },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`✅ Bank set to **$${after.bank}** for ${user}`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "transfer") {
        const from = interaction.options.getUser("from", true);
        const to = interaction.options.getUser("to", true);
        const amount = Math.max(1, interaction.options.getInteger("amount", true));

        // Check donor funds atomically
        const donor = await Wallet.findOne({ userId: from.id });
        if (!donor || (donor.cash ?? 0) < amount) {
          return interaction.reply({ content: "❌ Donor has insufficient cash.", flags: MessageFlags.Ephemeral });
        }

        await Wallet.findOneAndUpdate(
          { userId: from.id },
          { $inc: { cash: -amount } },
          { new: true }
        );

        const recipient = await Wallet.findOneAndUpdate(
          { userId: to.id },
          {
            $setOnInsert: { userId: to.id, ...WALLET_DEFAULTS },
            $inc: { cash: amount },
          },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`🔄 Transferred **$${amount}** from ${from} to ${to}.\n${to} new cash: **$${recipient.cash}**`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "reset") {
        const user = interaction.options.getUser("user", true);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { cash: 0, bank: 0 } },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`🧹 Reset cash & bank for ${user}.\nCash: **$${after.cash}**, Bank: **$${after.bank}**`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ===== crime =====
    if (group === "crime") {
      if (sub === "setwarrants") {
        const user = interaction.options.getUser("user", true);
        const count = Math.max(0, interaction.options.getInteger("count", true));

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { warrants: count } },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`📝 Warrants for ${user}: **${after.warrants}**`, Colors.Orange)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "clearwarrants") {
        const user = interaction.options.getUser("user", true);

        const after = await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { warrants: 0 } },
          { upsert: true, new: true }
        );

        return interaction.reply({
          embeds: [ok(`🧹 Cleared warrants for ${user}. Now **${after.warrants}**.`, Colors.Orange)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "jail") {
        const user = interaction.options.getUser("user", true);
        const minutes = Math.max(1, interaction.options.getInteger("minutes", true));
        const w = await Wallet.findOne({ userId: user.id }) || new Wallet({ userId: user.id, ...WALLET_DEFAULTS });
        const msg = await sendToJail(w, minutes); // helper saves internally
        return interaction.reply({ embeds: [ok(`🚔 ${user} ${msg}`, Colors.Red)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "free") {
        const user = interaction.options.getUser("user", true);

        await Wallet.findOneAndUpdate(
          { userId: user.id },
          {
            $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS },
            $set: { jailUntil: 0, hospitalUntil: 0, hospitalReason: "" },
          },
          { upsert: true, new: true }
        );

        return interaction.reply({ embeds: [ok(`🕊️ Freed ${user} (jail & hospital cleared).`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "hospital") {
        const user = interaction.options.getUser("user", true);
        const minutes = Math.max(1, interaction.options.getInteger("minutes", true));
        const reason = interaction.options.getString("reason") || "Admin hospitalization";
        const w = await Wallet.findOne({ userId: user.id }) || new Wallet({ userId: user.id, ...WALLET_DEFAULTS });
        const msg = await sendToHospital(w, minutes, reason); // helper saves internally
        return interaction.reply({ embeds: [ok(`🏥 ${user} ${msg}`, Colors.Red)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "revive") {
        const user = interaction.options.getUser("user", true);

        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { isDead: false } },
          { upsert: true, new: true }
        );

        return interaction.reply({ embeds: [ok(`❤️ Revived ${user}.`)], flags: MessageFlags.Ephemeral });
      }
    }

    // ===== cooldowns =====
    if (group === "cooldowns") {
      if (sub === "clear") {
        const user = interaction.options.getUser("user", true);
        const cmd = interaction.options.getString("command");

        if (cmd) {
          await Wallet.updateOne({ userId: user.id }, { $unset: { [`cooldowns.${cmd}`]: "" } });
          return interaction.reply({ embeds: [ok(`⏳ Cleared \`${cmd}\` cooldown for ${user}.`)], flags: MessageFlags.Ephemeral });
        } else {
          await Wallet.findOneAndUpdate(
            { userId: user.id },
            { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { cooldowns: {} } },
            { upsert: true }
          );
          return interaction.reply({ embeds: [ok(`⏳ Cleared **all** cooldowns for ${user}.`)], flags: MessageFlags.Ephemeral });
        }
      }
    }

    // ===== user =====
    if (group === "user") {
      if (sub === "createwallet") {
        const user = interaction.options.getUser("user", true);
        const existing = await Wallet.findOne({ userId: user.id });
        if (existing) {
          return interaction.reply({ embeds: [ok(`ℹ️ Wallet already exists for ${user}.`, Colors.Blurple)], flags: MessageFlags.Ephemeral });
        }

        await Wallet.create({ userId: user.id, ...WALLET_DEFAULTS });
        return interaction.reply({ embeds: [ok(`✅ Created wallet for ${user}.`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "deletewallet") {
        const user = interaction.options.getUser("user", true);
        await Wallet.deleteOne({ userId: user.id });
        return interaction.reply({ embeds: [ok(`🗑️ Deleted wallet for ${user}.`, Colors.Red)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "resetwallet") {
        const user = interaction.options.getUser("user", true);

        await Wallet.findOneAndUpdate(
          { userId: user.id },
          { $setOnInsert: { userId: user.id, ...WALLET_DEFAULTS }, $set: { ...WALLET_DEFAULTS } },
          { upsert: true }
        );

        return interaction.reply({ embeds: [ok(`🔄 Reset wallet for ${user}.`)], flags: MessageFlags.Ephemeral });
      }
    }

    // ===== gang =====
    if (group === "gang") {
      if (sub === "setlevel") {
        const gangId = interaction.options.getString("gangid", true);
        const level = Math.max(1, interaction.options.getInteger("level", true));
        await Gang.updateOne({ gangId }, { $set: { level } }, { upsert: true });
        return interaction.reply({ embeds: [ok(`🛠️ Gang \`${gangId}\` level set to **${level}**.`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "treasury") {
        const gangId = interaction.options.getString("gangid", true);
        const amount = interaction.options.getInteger("amount", true);
        const after = await Gang.findOneAndUpdate(
          { gangId },
          { $setOnInsert: { gangId, treasury: 0, level: 1, active: true }, $inc: { treasury: amount } },
          { upsert: true, new: true }
        );
        return interaction.reply({
          embeds: [ok(`💰 Gang \`${gangId}\` treasury adjusted by **$${amount}**.\nNew: **$${after.treasury ?? 0}**`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "disband") {
        const gangId = interaction.options.getString("gangid", true);
        await Gang.findOneAndUpdate(
          { gangId },
          { $setOnInsert: { gangId, treasury: 0, level: 1 }, $set: { active: false } },
          { upsert: true }
        );
        return interaction.reply({ embeds: [ok(`❌ Disbanded gang \`${gangId}\`.`, Colors.Red)], flags: MessageFlags.Ephemeral });
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

        return interaction.reply({
          embeds: [ok(`🗺️ Territory **${after.name}** now owned by gang \`${gangId}\`.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ===== promo =====
    if (group === "promo") {
      if (sub === "create") {
        const code = interaction.options.getString("code", true).toUpperCase();
        const value = interaction.options.getInteger("value", true);
        const maxUses = Math.max(1, interaction.options.getInteger("maxuses", true));
        const days = interaction.options.getInteger("days") ?? 14;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await PromoCode.create({ code, value, maxUses, usedCount: 0, expiresAt, active: true });
        return interaction.reply({
          embeds: [ok(`🎁 Promo **${code}** created: value **$${value}**, maxUses **${maxUses}**, expires **${expiresAt.toDateString()}**`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "delete") {
        const code = interaction.options.getString("code", true).toUpperCase();
        await PromoCode.deleteOne({ code });
        return interaction.reply({ embeds: [ok(`🗑️ Promo **${code}** deleted.`, Colors.Red)], flags: MessageFlags.Ephemeral });
      }
    }

    // ===== util =====
    if (group === "util") {
      if (sub === "announce") {
        const channel = interaction.options.getChannel("channel", true);
        const title = interaction.options.getString("title", true);
        const message = interaction.options.getString("message", true);

        const embed = new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(title)
          .setDescription(message)
          .setFooter({ text: `Announcement by ${interaction.user.tag}` })
          .setTimestamp(new Date());

        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: "📣 Announcement sent.", flags: MessageFlags.Ephemeral });
      }

      if (sub === "ping") {
        return interaction.reply({ embeds: [ok("🏓 Admin panel online.")], flags: MessageFlags.Ephemeral });
      }

      if (sub === "debugwallet") {
        const user = interaction.options.getUser("user", true);
        const doc = await Wallet.findOne({ userId: user.id }).lean();
        return interaction.reply({
          content: "```json\n" + JSON.stringify(doc ?? { note: "no wallet" }, null, 2) + "\n```",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // fallback (shouldn’t hit)
    return interaction.reply({ content: "Unknown admin action.", flags: MessageFlags.Ephemeral });

  } catch (err) {
    console.error("[/admin] error:", err);
    return interaction.reply({
      content: "❌ Something went wrong executing that admin action.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
