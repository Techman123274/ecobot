import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import CommandToggle from "../../src/database/CommandToggle.js";

// Comma-separated owner IDs in env, plus optional DEV role (by ID)
const OWNER_IDS = (process.env.OWNER_IDS || process.env.OWNER_ID || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEV_ROLE_ID = process.env.DEV_ROLE_ID || null;

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

function isAuthorized(interaction) {
  if (OWNER_IDS.includes(interaction.user.id)) return true;
  // Allow admins or a specific dev role
  const member = interaction.member;
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (DEV_ROLE_ID && member.roles?.cache?.has?.(DEV_ROLE_ID)) return true;
  return false;
}

export const data = new SlashCommandBuilder()
  .setName("devctl")
  .setDescription("Developer: enable/disable commands for scopes")
  .addSubcommand((sc) =>
    sc
      .setName("disable")
      .setDescription("Disable a command")
      .addStringOption((o) =>
        o
          .setName("command")
          .setDescription("Command name (e.g. business)")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("scope")
          .setDescription("Scope to apply")
          .addChoices(
            { name: "global", value: "global" },
            { name: "guild", value: "guild" },
            { name: "role", value: "role" },
            { name: "user", value: "user" }
          )
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("target_id")
          .setDescription("For role/user scope (ID). For guild scope uses current guild unless provided.")
          .setRequired(false)
      )
      .addIntegerOption((o) =>
        o
          .setName("minutes")
          .setDescription("Optional: auto-expire after N minutes")
          .setMinValue(1)
          .setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Optional reason").setRequired(false)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("enable")
      .setDescription("Enable a command (remove the toggle)")
      .addStringOption((o) =>
        o
          .setName("command")
          .setDescription("Command name (e.g. business)")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("scope")
          .setDescription("Scope to apply")
          .addChoices(
            { name: "global", value: "global" },
            { name: "guild", value: "guild" },
            { name: "role", value: "role" },
            { name: "user", value: "user" }
          )
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("target_id")
          .setDescription("For role/user scope (ID). For guild scope uses current guild unless provided.")
          .setRequired(false)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("list")
      .setDescription("List active disables for a command")
      .addStringOption((o) =>
        o
          .setName("command")
          .setDescription("Command name (e.g. business)")
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  if (!isAuthorized(interaction)) {
    return interaction.reply({ content: "⛔ You are not allowed to use this.", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  const command = interaction.options.getString("command").toLowerCase();

  // helper to resolve scope ids
  const scope = interaction.options.getString("scope");
  const providedTarget = interaction.options.getString("target_id") || null;

  if (sub === "disable") {
    const minutes = interaction.options.getInteger("minutes");
    const reason = interaction.options.getString("reason") || null;

    const doc = {
      command,
      scope,
      guildId: null,
      roleId: null,
      userId: null,
      disabled: true,
      reason,
      expiresAt: minutes ? new Date(Date.now() + minutes * 60_000) : null,
      updatedBy: interaction.user.id,
    };

    if (scope === "guild") {
      doc.guildId = providedTarget || interaction.guildId || null;
      if (!doc.guildId) {
        return interaction.reply({ content: "❌ No guild ID available.", ephemeral: true });
      }
    } else if (scope === "role") {
      if (!providedTarget) {
        return interaction.reply({ content: "❌ Provide a role ID for role scope.", ephemeral: true });
      }
      doc.roleId = providedTarget;
      // optionally tie to current guild
      doc.guildId = interaction.guildId || null;
    } else if (scope === "user") {
      if (!providedTarget) {
        return interaction.reply({ content: "❌ Provide a user ID for user scope.", ephemeral: true });
      }
      doc.userId = providedTarget;
    }

    // upsert
    await CommandToggle.findOneAndUpdate(
      {
        command: doc.command,
        scope: doc.scope,
        guildId: doc.guildId,
        roleId: doc.roleId,
        userId: doc.userId,
      },
      doc,
      { upsert: true, new: true }
    );

    const expiresText = doc.expiresAt ? ` (expires <t:${Math.floor(doc.expiresAt.getTime()/1000)}:R>)` : "";
    return interaction.reply({
      content: `✅ Disabled **/${command}** @ **${scope}**${doc.roleId ? `:${doc.roleId}` : doc.userId ? `:${doc.userId}` : doc.guildId ? `:${doc.guildId}` : ""}${expiresText}${reason ? ` — ${reason}` : ""}`,
      ephemeral: true,
    });
  }

  if (sub === "enable") {
    const filter = {
      command,
      scope,
      guildId: null,
      roleId: null,
      userId: null,
    };

    if (scope === "guild") {
      filter.guildId = providedTarget || interaction.guildId || null;
      if (!filter.guildId) {
        return interaction.reply({ content: "❌ No guild ID available.", ephemeral: true });
      }
    } else if (scope === "role") {
      if (!providedTarget) {
        return interaction.reply({ content: "❌ Provide a role ID for role scope.", ephemeral: true });
      }
      filter.roleId = providedTarget;
      filter.guildId = interaction.guildId || null;
    } else if (scope === "user") {
      if (!providedTarget) {
        return interaction.reply({ content: "❌ Provide a user ID for user scope.", ephemeral: true });
      }
      filter.userId = providedTarget;
    }

    await CommandToggle.deleteMany(filter);

    return interaction.reply({
      content: `✅ Enabled **/${command}** @ **${scope}**${filter.roleId ? `:${filter.roleId}` : filter.userId ? `:${filter.userId}` : filter.guildId ? `:${filter.guildId}` : ""}`,
      ephemeral: true,
    });
  }

  if (sub === "list") {
    const rows = await CommandToggle.find({
      command,
      disabled: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!rows.length) {
      return interaction.reply({ content: `✅ No active disables for **/${command}**.`, ephemeral: true });
    }

    const lines = rows.map((r) => {
      const scopeTag =
        r.scope === "global"
          ? "global"
          : r.scope === "guild"
          ? `guild:${r.guildId}`
          : r.scope === "role"
          ? `role:${r.roleId}${r.guildId ? `@${r.guildId}` : ""}`
          : `user:${r.userId}`;
      const exp = r.expiresAt ? `, expires <t:${Math.floor(r.expiresAt.getTime()/1000)}:R>` : "";
      return `• **${scopeTag}** — ${r.reason || "no reason"}${exp}`;
    });

    const em = new EmbedBuilder()
      .setTitle(`🚧 Disabled: /${command}`)
      .setDescription(lines.join("\n"))
      .setColor(0xffcc00);

    return interaction.reply({ embeds: [em], ephemeral: true });
  }
}
