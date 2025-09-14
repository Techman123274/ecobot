import CommandToggle from "../database/CommandToggle.js";

const notExpired = { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };

/**
 * Returns { blocked: boolean, reason?: string }
 */
export async function isCommandBlocked(interaction, commandName) {
  const cmd = String(commandName || "").toLowerCase();
  if (!cmd) return { blocked: false };

  const guildId = interaction.guildId || null;
  const userId = interaction.user?.id || null;
  const roleIds = interaction.member?.roles?.cache
    ? [...interaction.member.roles.cache.keys()]
    : [];

  // Build a single query that matches any applicable toggle row
  const or = [
    // Global
    { command: cmd, scope: "global", disabled: true, ...notExpired },
  ];

  if (guildId) {
    // Guild-wide
    or.push({ command: cmd, scope: "guild", guildId, disabled: true, ...notExpired });
    // Role-based (optionally tied to guildId OR global role toggle)
    if (roleIds.length) {
      or.push({
        command: cmd,
        scope: "role",
        roleId: { $in: roleIds },
        disabled: true,
        ...notExpired,
        $or: [{ guildId: null }, { guildId }],
      });
    }
  }

  if (userId) {
    // Per-user
    or.push({ command: cmd, scope: "user", userId, disabled: true, ...notExpired });
  }

  const hit = await CommandToggle.findOne({ $or: or }).lean();
  if (!hit) return { blocked: false };

  return {
    blocked: true,
    reason:
      hit.reason ||
      `This command is currently disabled (${hit.scope}${hit.guildId ? `:${hit.guildId}` : ""}).`,
  };
}
