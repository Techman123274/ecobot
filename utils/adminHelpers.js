// utils/adminHelpers.js
import { Colors, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export function isAllowed(interaction) {
  const OWNER_ID = process.env.OWNER_ID || "";
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const isOwner = OWNER_ID && interaction.user.id === OWNER_ID;
  return Boolean(isAdmin || isOwner);
}

export function ok(content, color = Colors.Green) {
  return new EmbedBuilder().setColor(color).setDescription(content);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function ensureSafeInt(n) {
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) {
    throw new Error("INVALID_AMOUNT");
  }
}

export const WALLET_DEFAULTS = {
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

export async function logAction(interaction, action, details) {
  const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID || "";
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
  } catch {}
}
