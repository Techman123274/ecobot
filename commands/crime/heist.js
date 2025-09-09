
// commands/crime/heist.js
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import {
  HEIST_LOCATIONS, HEIST_ROLES, GEAR,
  getHeist, ensureNoActiveHeist, createHeist, joinHeist,
  movePhase, buyGear, summarizeCrew, resolveHeist, deleteHeist
} from "../../utils/heistManager.js";
import { runRoleTasks } from "../../utils/heistRoleTasks.js";
import { checkRestrictions, checkCooldown } from "../../utils/crimeSystem.js";

function locChoices() {
  return HEIST_LOCATIONS.map(l => ({
    name: l.name.replace(/[^a-zA-Z0-9\s\-!?.,]/g, ""), // safe for Discord slash choice
    value: l.key
  }));
}

function roleChoices() {
  return HEIST_ROLES.map(r => ({ name: r.name, value: r.key }));
}

function gearChoices() {
  return GEAR.map(g => ({ name: g.name, value: g.key }));
}

export const data = new SlashCommandBuilder()
  .setName("heist")
  .setDescription("Multiplayer, role-based heists")
  .addSubcommand(sub => sub
    .setName("start")
    .setDescription("Start a heist at a location")
    .addStringOption(o =>
      o.setName("location").setDescription("Heist location").setRequired(true).addChoices(...locChoices())
    )
  )
  .addSubcommand(sub => sub
    .setName("join")
    .setDescription("Join the active heist with a role")
    .addStringOption(o => o.setName("role").setDescription("Choose your role").setRequired(true).addChoices(...roleChoices()))
  )
  .addSubcommand(sub => sub
    .setName("prep")
    .setDescription("Buy gear to improve odds")
    .addStringOption(o => o.setName("item").setDescription("Gear to buy").setRequired(true).addChoices(...gearChoices()))
  )
  .addSubcommand(sub => sub.setName("status").setDescription("Show heist lobby/status"))
  .addSubcommand(sub => sub.setName("go").setDescription("Launch tasks (leader only)"))
  .addSubcommand(sub => sub.setName("abort").setDescription("Abort the active heist (leader only)"));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  if (["start", "join", "prep", "go"].includes(sub)) {
    const { allowed, reason, wallet } = await checkRestrictions(userId);
    if (!allowed) return interaction.reply({ content: reason, flags: 64 });

    const cd = checkCooldown(wallet, "heist", 15);
    if (!cd.ready && sub === "start") return interaction.reply({ content: cd.message, flags: 64 });
  }

  if (sub === "start") {
    const locationKey = interaction.options.getString("location");
    try {
      ensureNoActiveHeist(guildId);
      const heist = createHeist({ guildId, leaderId: userId, locationKey });
      const embed = new EmbedBuilder()
        .setTitle("💼 Heist Created")
        .setColor("Blurple")
        .setDescription(
          `Location: **${heist.location.name}**\n\n` +
          `Join with **/heist join role:<role>**\n` +
          `After joining, buy gear with **/heist prep item:<gear>**\n\n` +
          `Roles available: ${HEIST_ROLES.map(r => `\`${r.key}\``).join(", ")}`
        );
      return interaction.reply({ embeds: [embed] });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, flags: 64 });
    }
  }

  if (sub === "join") {
    const role = interaction.options.getString("role");
    const heist = getHeist(guildId);
    if (!heist) return interaction.reply({ content: "❌ No active heist. Start one with `/heist start`.", flags: 64 });
    if (heist.phase !== "lobby" && heist.phase !== "prep") return interaction.reply({ content: "❌ Heist already started.", flags: 64 });

    try {
      joinHeist(guildId, userId, role);
      movePhase(guildId, "prep");
      const updated = getHeist(guildId);
      const embed = new EmbedBuilder()
        .setTitle("👥 Crew Updated")
        .setColor("Green")
        .setDescription(summarizeCrew(updated));
      return interaction.reply({ content: `✅ Joined as **${role}**.`, embeds: [embed] });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, flags: 64 });
    }
  }

  if (sub === "prep") {
    const item = interaction.options.getString("item");
    const heist = getHeist(guildId);
    if (!heist) return interaction.reply({ content: "❌ No active heist to prep for.", flags: 64 });
    if (!heist.members[userId]) return interaction.reply({ content: "❌ You’re not part of this heist.", flags: 64 });

    const costMap = { mask: 200, drill: 400, jammer: 350, armor: 300, fastcar: 500, blueprints: 450 };
    const cost = costMap[item] ?? 200;

    const wallet = await Wallet.findOne({ userId });
    if (!wallet || wallet.balance < cost)
      return interaction.reply({ content: `❌ ${GEAR.find(g => g.key === item)?.name || "Item"} costs **${cost}** coins.`, flags: 64 });

    try {
      buyGear(guildId, userId, item);
      wallet.balance -= cost;
      await wallet.save();

      const heist2 = getHeist(guildId);
      const embed = new EmbedBuilder()
        .setTitle("🧰 Gear Purchased")
        .setColor("Gold")
        .setDescription(summarizeCrew(heist2));
      return interaction.reply({ content: `✅ Bought **${GEAR.find(g => g.key === item)?.name}** for **${cost}**.`, embeds: [embed] });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, flags: 64 });
    }
  }

  if (sub === "status") {
    const heist = getHeist(guildId);
    if (!heist) return interaction.reply({ content: "ℹ️ No active heist.", flags: 64 });
    const embed = new EmbedBuilder()
      .setTitle(`📊 Heist Status — ${heist.location.name}`)
      .setColor(0x86c5da)
      .addFields(
        { name: "Phase", value: heist.phase, inline: true },
        { name: "Leader", value: `<@${heist.leaderId}>`, inline: true },
      )
      .setDescription(summarizeCrew(heist));
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "go") {
    const heist = getHeist(guildId);
    if (!heist) return interaction.reply({ content: "❌ No active heist.", flags: 64 });
    if (heist.leaderId !== userId) return interaction.reply({ content: "❌ Only the leader can launch the heist.", flags: 64 });

    if (Object.keys(heist.members).length < 3)
      return interaction.reply({ content: "❌ Need at least 3 crew members.", flags: 64 });

    movePhase(guildId, "active");

    const intro = new EmbedBuilder()
      .setTitle(`🔫 Heist Started — ${heist.location.name}`)
      .setColor(0x7289da)
      .setDescription("Role tasks have been dispatched. Complete them quickly!");

    await interaction.reply({ embeds: [intro] });

    await runRoleTasks({ guildId, channel: interaction.channel, heist, durationMs: 45_000 });

    await resolveHeist({
      guildId,
      channelSend: async ({ title, color, desc }) => {
        const done = new EmbedBuilder().setTitle(title).setColor(color).setDescription(desc);
        await interaction.channel.send({ embeds: [done] });
      }
    });

    return;
  }

  if (sub === "abort") {
    const heist = getHeist(guildId);
    if (!heist) return interaction.reply({ content: "❌ No active heist.", flags: 64 });
    if (heist.leaderId !== userId) return interaction.reply({ content: "❌ Only the leader can abort.", flags: 64 });

    deleteHeist(guildId);
    return interaction.reply({ content: `🛑 Heist at ${heist.location.name} aborted by the leader.` });
  }
}
