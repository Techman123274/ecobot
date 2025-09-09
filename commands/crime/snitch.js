import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import { checkRestrictions } from "../../utils/crimeSystem.js";

const REDUCTION_FACTOR = 0.4; // 40% reduction of remaining jail time

export const data = new SlashCommandBuilder()
  .setName("snitch")
  .setDescription("Reduce jail sentence by snitching (once per sentence).")
  .addSubcommand((sub) =>
    sub
      .setName("me")
      .setDescription("Snitch to reduce your own remaining jail time.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("grant")
      .setDescription("Staff: apply snitch reduction to another user.")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("The jailed user to grant reduction to.")
          .setRequired(true)
      )
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === "grant") {
    // staff only
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)
    ) {
      return interaction.reply({
        content: "❌ You don’t have permission to use `/snitch grant`.",
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser("user", true);
    const wallet = await Wallet.findOne({ userId: target.id });
    if (!wallet || !wallet.jailUntil || wallet.jailUntil < Date.now()) {
      return interaction.reply({
        content: `${target} is not currently in jail.`,
        ephemeral: true,
      });
    }
    if (wallet.snitched) {
      return interaction.reply({
        content: `${target} already snitched this sentence.`,
        ephemeral: true,
      });
    }

    const before = wallet.jailUntil - Date.now();
    const reduction = Math.floor(before * REDUCTION_FACTOR);
    wallet.jailUntil -= reduction;
    wallet.snitched = true;
    await wallet.save();

    const embed = new EmbedBuilder()
      .setTitle("Snitch Reduction Granted")
      .setColor(0xf1c40f)
      .setDescription(
        `${target} had their jail time reduced by ${Math.round(
          REDUCTION_FACTOR * 100
        )}%.`
      )
      .addFields(
        { name: "Before", value: formatDuration(before), inline: true },
        {
          name: "After",
          value: formatDuration(wallet.jailUntil - Date.now()),
          inline: true,
        },
        {
          name: "Release",
          value: `<t:${Math.floor(wallet.jailUntil / 1000)}:R>`,
          inline: true,
        }
      );

    return interaction.reply({ embeds: [embed] });
  }

  // sub === "me"
  const restrictions = await checkRestrictions(interaction.user.id, "snitch");
  if (!restrictions.wallet) {
    return interaction.reply({ content: restrictions.reason, ephemeral: true });
  }

  const wallet = restrictions.wallet;
  if (!wallet.jailUntil || wallet.jailUntil < Date.now()) {
    return interaction.reply({
      content: "✅ You are not currently in jail.",
      ephemeral: true,
    });
  }
  if (wallet.snitched) {
    return interaction.reply({
      content: "❌ You already snitched this sentence.",
      ephemeral: true,
    });
  }

  const before = wallet.jailUntil - Date.now();
  const reduction = Math.floor(before * REDUCTION_FACTOR);
  wallet.jailUntil -= reduction;
  wallet.snitched = true;
  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🐀 You Snitched!")
    .setColor(0xe67e22)
    .setDescription(
      `You reduced your jail time by ${Math.round(
        REDUCTION_FACTOR * 100
      )}%.\nStay safe out there...`
    )
    .addFields(
      { name: "Before", value: formatDuration(before), inline: true },
      {
        name: "Now",
        value: formatDuration(wallet.jailUntil - Date.now()),
        inline: true,
      },
      {
        name: "Release",
        value: `<t:${Math.floor(wallet.jailUntil / 1000)}:R>`,
        inline: true,
      }
    );

  return interaction.reply({ embeds: [embed] });
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
