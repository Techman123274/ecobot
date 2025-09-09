// commands/crime/call911.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} from "discord.js";

import Wallet from "../../src/database/Wallet.js";
import {
  checkRestrictions,
  checkCooldown,
  sendToJail,
  sendToHospital,
} from "../../utils/crimeSystem.js";

// ---------- Tunables ----------
const COOLDOWN_MIN = 5;
const BASE_CATCH_CHANCE = 0.20;
const CATCH_PER_WARRANT = 0.18;
const MAX_CATCH_CHANCE = 0.92;
const ARREST_WEIGHT = 0.7;
const JAIL_MIN_PER_WARRANT = 3;
const JAIL_MIN_FLOOR = 2;
const PAYOUT_BASE = 400;
const PAYOUT_PER_WARRANT = 650;
const CONFISCATE_MAX_RATIO = 0.35;
const ESCAPE_WARRANT_TICK = 1;
const LOOP_STEPS = [
  "📞 Dispatch received",
  "🚓 Units en route",
  "👀 Area canvass",
  "🏃 Suspect contact",
  "⚖️ Resolution"
];
const STEP_DELAY_MS = 1750;

// Utils
const delay = (ms) => new Promise(res => setTimeout(res, ms));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const r = () => Math.random();

export const data = new SlashCommandBuilder()
  .setName("call911")
  .setDescription("Call 911 on a user with warrants. If caught, they’re arrested/raided and you get paid.")
  .addUserOption(opt =>
    opt.setName("target")
      .setDescription("Who are you reporting?")
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("note")
      .setDescription("Extra details for dispatch.")
      .setRequired(false)
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const caller = interaction.user;
  const target = interaction.options.getUser("target", true);
  const note = interaction.options.getString("note") || "No additional details provided.";

  if (target.id === caller.id) {
    return interaction.reply({ content: "❌ You can’t call 911 on yourself.", flags: MessageFlags.Ephemeral });
  }
  if (target.bot) {
    return interaction.reply({ content: "🤖 You can’t call 911 on a bot.", flags: MessageFlags.Ephemeral });
  }

  const restrict = await checkRestrictions(caller.id, "call911");
  if (!restrict.allowed) {
    return interaction.reply({ content: restrict.reason, flags: MessageFlags.Ephemeral });
  }

  const callerWallet = restrict.wallet || await Wallet.findOne({ userId: caller.id });
  if (!callerWallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", flags: MessageFlags.Ephemeral });
  }

  const cd = checkCooldown(callerWallet, "call911", COOLDOWN_MIN);
  if (!cd.ready) {
    return interaction.reply({ content: cd.message, flags: MessageFlags.Ephemeral });
  }
  // do not save here; checkCooldown already persists

  const targetWallet = await Wallet.findOne({ userId: target.id });
  if (!targetWallet) {
    return interaction.reply({ content: "❌ Target has no wallet on file. 911 can’t proceed.", flags: MessageFlags.Ephemeral });
  }

  const warrants = Math.max(0, targetWallet.warrants || 0);
  const catchChance = clamp(BASE_CATCH_CHANCE + warrants * CATCH_PER_WARRANT, 0, MAX_CATCH_CHANCE);

  const embed = new EmbedBuilder()
    .setColor(0xff2d55)
    .setAuthor({ name: "911 Dispatch" })
    .setTitle("Emergency Call")
    .setDescription(`**Caller:** ${caller}\n**Target:** ${target}\n**Note:** ${note}`)
    .addFields(
      { name: "Target Warrants (pre-op)", value: `\`${warrants}\``, inline: true },
      { name: "Estimated Catch Chance", value: `\`${Math.round(catchChance * 100)}%\``, inline: true }
    )
    .setFooter({ text: "Running operation..." })
    .setTimestamp(Date.now());

  const progressBar = (i, total) => {
    const done = "▓".repeat(i);
    const todo = "░".repeat(total - i);
    return `Progress: \`${done}${todo}\` ${Math.floor((i / total) * 100)}%`;
  };

  await interaction.reply({ embeds: [embed] });

  for (let i = 0; i < LOOP_STEPS.length; i++) {
    await delay(STEP_DELAY_MS);
    embed.spliceFields(2, embed.data.fields?.length ? embed.data.fields.length - 2 : 0);
    embed.addFields(
      { name: "Status", value: LOOP_STEPS.slice(0, i + 1).map(s => `• ${s}`).join("\n") },
      { name: "\u200B", value: progressBar(i + 1, LOOP_STEPS.length) }
    );
    await interaction.editReply({ embeds: [embed] });
  }

  const isCaught = r() < catchChance;

  const [callerW, targetW] = await Promise.all([
    Wallet.findOne({ userId: caller.id }),
    Wallet.findOne({ userId: target.id }),
  ]);

  if (!callerW || !targetW) {
    embed.setColor(0xff0033)
      .setFooter({ text: "Operation failed due to an internal error." })
      .addFields({ name: "Error", value: "Missing wallets mid-operation." });
    return interaction.editReply({ embeds: [embed] });
  }

  let resultText = "";
  let payout = 0;
  let postWarrants = targetW.warrants || 0;

  if (isCaught) {
    const arrestPath = r() < ARREST_WEIGHT;

    if (arrestPath) {
      const mins = Math.max(JAIL_MIN_FLOOR, (warrants || 0) * JAIL_MIN_PER_WARRANT);
      await sendToJail(targetW, mins);

      payout = Math.max(0, Math.floor(PAYOUT_BASE + warrants * PAYOUT_PER_WARRANT + (Math.random() * 200)));

      const confiscate = Math.min(
        Math.floor((targetW.cash || 0) * (0.10 + Math.random() * (CONFISCATE_MAX_RATIO - 0.10))),
        targetW.cash || 0
      );
      if (confiscate > 0) {
        targetW.cash = (targetW.cash || 0) - confiscate;
        payout += Math.floor(confiscate * 0.6);
      }

      callerW.cash = (callerW.cash || 0) + payout;
      targetW.warrants = 0;
      await Promise.all([callerW.save(), targetW.save()]);
      postWarrants = targetW.warrants || 0;

      resultText =
        `**Caught & Arrested.**\n` +
        `• ⛓️ Jail time: **${mins} min**\n` +
        `• 💵 Your payout: **$${payout.toLocaleString()}**\n` +
        (confiscate > 0 ? `• 🔎 Confiscated from target cash: **$${confiscate.toLocaleString()}**\n` : "") +
        `• 🔻 Target warrants decreased to \`${postWarrants}\``;

    } else {
      const maxGrab = Math.floor((targetW.cash || 0) * (0.20 + Math.random() * CONFISCATE_MAX_RATIO));
      const confiscated = Math.max(0, maxGrab);
      targetW.cash = Math.max(0, (targetW.cash || 0) - confiscated);

      payout = Math.max(0, Math.floor(PAYOUT_BASE + warrants * PAYOUT_PER_WARRANT + (Math.random() * 400)));
      payout += Math.floor(confiscated * 0.65);

      callerW.cash = (callerW.cash || 0) + payout;
      targetW.warrants = 0;
      await Promise.all([callerW.save(), targetW.save()]);
      postWarrants = targetW.warrants || 0;

      resultText =
        `**Caught & Raided.**\n` +
        `• 🥷 Confiscated from target cash: **$${confiscated.toLocaleString()}**\n` +
        `• 💵 Your payout: **$${payout.toLocaleString()}**\n` +
        `• 🔻 Target warrants decreased to \`${postWarrants}\``;
    }
  } else {
    const injury = r() < 0.15;
    let injuryLine = "";
    if (injury) {
      const hospMin = 2 + Math.floor(Math.random() * 5);
      await sendToHospital(targetW, hospMin, "Injured while fleeing police");
      injuryLine = `\n• 🏥 Target hospitalized for **${hospMin} min** (injured while fleeing)`;
    }

    targetW.warrants = (targetW.warrants || 0) + ESCAPE_WARRANT_TICK;
    await targetW.save();
    postWarrants = targetW.warrants || 0;

    resultText =
      `**Target escaped.**\n` +
      `• 🔺 Warrants increased to \`${postWarrants}\`` +
      injuryLine +
      `\n• 💸 No payout this time.`;
  }

  const finalColor = isCaught ? 0x00b140 : 0xffa500;
  embed.setColor(finalColor)
    .setFooter({ text: isCaught ? "Operation complete — suspect apprehended." : "Operation complete — suspect evaded." })
    .spliceFields(0, embed.data.fields?.length || 0)
    .addFields(
      { name: "Target Warrants (pre-op)", value: `\`${warrants}\``, inline: true },
      { name: "Catch Chance", value: `\`${Math.round(catchChance * 100)}%\``, inline: true },
      { name: "Outcome", value: resultText }
    );

  await interaction.editReply({ embeds: [embed] });
}
