// utils/heistRoleTasks.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder
} from "discord.js";
import { setTaskResult } from "./heistManager.js";

/**
 * Sends role-specific interactive tasks for each participant.
 * Collectors run for up to `durationMs`. Each task reports a "status" and "score".
 *   status: "success" | "fail" | "timeout"
 *   score:  -1 .. +1 (leader strategy), 0/1 typical for others
 */
export async function runRoleTasks({ guildId, channel, heist, durationMs = 45_000 }) {
  const tasks = [];

  for (const [userId, member] of Object.entries(heist.members)) {
    const role = member.role;

    switch (role) {
      case "leader":
        tasks.push(runLeaderTask({ guildId, channel, userId, durationMs }));
        break;
      case "driver":
        tasks.push(runDriverTask({ guildId, channel, userId, durationMs }));
        break;
      case "hacker":
        tasks.push(runHackerTask({ guildId, channel, userId, durationMs }));
        break;
      case "muscle":
        tasks.push(runMuscleTask({ guildId, channel, userId, durationMs }));
        break;
      case "lookout":
        tasks.push(runLookoutTask({ guildId, channel, userId, durationMs }));
        break;
    }
  }

  // Wait for all role tasks to complete (resolve on collector end)
  await Promise.allSettled(tasks);
}

/** Leader chooses strategy */
function runLeaderTask({ guildId, channel, userId, durationMs }) {
  return new Promise(async resolve => {
    const embed = new EmbedBuilder()
      .setTitle("🧠 Leader Decision")
      .setColor("Blurple")
      .setDescription(`<@${userId}>, choose your approach:\n` +
        "• **Cautious** (safer, lower payout)\n" +
        "• **Neutral** (balanced)\n" +
        "• **Aggressive** (riskier, higher payout)");

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`leader_${userId}`)
        .setPlaceholder("Select strategy")
        .addOptions(
          { label: "Cautious", value: "cautious" },
          { label: "Neutral", value: "neutral" },
          { label: "Aggressive", value: "aggressive" }
        )
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    const collector = msg.createMessageComponentCollector({ time: durationMs });

    collector.on("collect", async i => {
      if (i.user.id !== userId || !i.customId.startsWith("leader_")) {
        return i.deferUpdate().catch(() => {});
      }
      let score = 0;
      if (i.values[0] === "cautious") score = -1;
      if (i.values[0] === "neutral") score = 0;
      if (i.values[0] === "aggressive") score = 1;

      await i.update({ content: `🧠 Leader chose **${i.values[0]}**.`, components: [], embeds: [] });
      setTaskResult(guildId, userId, { status: "success", score });
      collector.stop("done");
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "done") {
        setTaskResult(guildId, userId, { status: "timeout", score: 0 });
        await msg.edit({ content: "⏳ Leader timed out (Neutral assumed).", components: [], embeds: [] }).catch(() => {});
      }
      resolve();
    });
  });
}

/** Driver quick‐reaction */
function runDriverTask({ guildId, channel, userId, durationMs }) {
  return new Promise(async resolve => {
    const embed = new EmbedBuilder()
      .setTitle("🚗 Driver — Getaway Window")
      .setColor("Green")
      .setDescription(`<@${userId}>, be ready! Hit **ACCELERATE** when the light turns green.`);

    const goBtn = new ButtonBuilder().setCustomId(`drv_go_${userId}`).setLabel("ACCELERATE").setStyle(ButtonStyle.Success).setDisabled(true);
    const row = new ActionRowBuilder().addComponents(goBtn);
    const msg = await channel.send({ embeds: [embed], components: [row] });

    const delay = 1500 + Math.floor(Math.random() * 3000);
    setTimeout(async () => {
      try {
        goBtn.setDisabled(false);
        await msg.edit({ components: [new ActionRowBuilder().addComponents(goBtn)] });
      } catch {}
    }, delay);

    const collector = msg.createMessageComponentCollector({ time: durationMs });

    collector.on("collect", async i => {
      if (i.customId !== `drv_go_${userId}`) return i.deferUpdate().catch(() => {});
      if (i.user.id !== userId) return i.reply({ content: "Not your wheel!", flags: 64 }).catch(() => {});
      await i.update({ content: "🚗💨 Perfect launch!", components: [], embeds: [] });
      setTaskResult(guildId, userId, { status: "success", score: 1 });
      collector.stop("done");
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "done") {
        setTaskResult(guildId, userId, { status: "timeout", score: 0 });
        await msg.edit({ content: "🛑 Driver missed the launch window.", components: [], embeds: [] }).catch(() => {});
      }
      resolve();
    });
  });
}

/** Hacker puzzle */
function runHackerTask({ guildId, channel, userId, durationMs }) {
  return new Promise(async resolve => {
    const embed = new EmbedBuilder()
      .setTitle("💻 Hacker — Bypass Sequence")
      .setColor("DarkAqua")
      .setDescription(`<@${userId}>, input the sequence **A → B → C** to avoid alarms.`);

    const A = new ButtonBuilder().setCustomId(`hk_a_${userId}`).setLabel("A").setStyle(ButtonStyle.Primary);
    const B = new ButtonBuilder().setCustomId(`hk_b_${userId}`).setLabel("B").setStyle(ButtonStyle.Primary);
    const C = new ButtonBuilder().setCustomId(`hk_c_${userId}`).setLabel("C").setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(A, B, C);

    const msg = await channel.send({ embeds: [embed], components: [row] });
    let step = 0;
    const collector = msg.createMessageComponentCollector({ time: durationMs });

    collector.on("collect", async i => {
      if (i.user.id !== userId) return i.reply({ content: "Not your terminal!", flags: 64 }).catch(() => {});
      const id = i.customId;
      if (step === 0 && id === `hk_a_${userId}`) { step = 1; await i.deferUpdate(); return; }
      if (step === 1 && id === `hk_b_${userId}`) { step = 2; await i.deferUpdate(); return; }
      if (step === 2 && id === `hk_c_${userId}`) {
        await i.update({ content: "✅ Vault bypassed silently.", components: [], embeds: [] });
        setTaskResult(guildId, userId, { status: "success", score: 1 });
        return collector.stop("done");
      }
      await i.update({ content: "❌ Wrong order! Alarm tripped.", components: [], embeds: [] });
      setTaskResult(guildId, userId, { status: "fail", score: 0 });
      collector.stop("done");
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "done") {
        setTaskResult(guildId, userId, { status: "timeout", score: 0 });
        await msg.edit({ content: "⏳ Hacker timed out. Backup alarms warming up.", components: [], embeds: [] }).catch(() => {});
      }
      resolve();
    });
  });
}

/** Muscle */
function runMuscleTask({ guildId, channel, userId, durationMs }) {
  return new Promise(async resolve => {
    const embed = new EmbedBuilder()
      .setTitle("💪 Muscle — Guard Encounter")
      .setColor("Orange")
      .setDescription(`<@${userId}>, how do you handle the guards?`);

    const intimidate = new ButtonBuilder().setCustomId(`ms_int_${userId}`).setLabel("Intimidate").setStyle(ButtonStyle.Primary);
    const fight = new ButtonBuilder().setCustomId(`ms_fgt_${userId}`).setLabel("Fight").setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(intimidate, fight);

    const msg = await channel.send({ embeds: [embed], components: [row] });
    const collector = msg.createMessageComponentCollector({ time: durationMs });

    collector.on("collect", async i => {
      if (i.user.id !== userId) return i.reply({ content: "Not your scene!", flags: 64 }).catch(() => {});
      if (i.customId === `ms_int_${userId}`) {
        await i.update({ content: "😨 Guards back down. Safer exit.", components: [], embeds: [] });
        setTaskResult(guildId, userId, { status: "success", score: 1 });
      } else {
        const okRoll = Math.random() < 0.6;
        if (okRoll) {
          await i.update({ content: "🥊 You cleared the path, but raised heat.", components: [], embeds: [] });
          setTaskResult(guildId, userId, { status: "success", score: 1 });
        } else {
          await i.update({ content: "💥 You got hurt in the brawl.", components: [], embeds: [] });
          setTaskResult(guildId, userId, { status: "fail", score: 0 });
        }
      }
      collector.stop("done");
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "done") {
        setTaskResult(guildId, userId, { status: "timeout", score: 0 });
        await msg.edit({ content: "⏳ Muscle hesitated; guards regrouped.", components: [], embeds: [] }).catch(() => {});
      }
      resolve();
    });
  });
}

/** Lookout */
function runLookoutTask({ guildId, channel, userId, durationMs }) {
  return new Promise(async resolve => {
    const embed = new EmbedBuilder()
      .setTitle("👀 Lookout — Patrol Timing")
      .setColor("Grey")
      .setDescription(`<@${userId}>, call it: warn early (safer) or hold (riskier)?`);

    const warn = new ButtonBuilder().setCustomId(`lo_warn_${userId}`).setLabel("Warn Early").setStyle(ButtonStyle.Primary);
    const hold = new ButtonBuilder().setCustomId(`lo_hold_${userId}`).setLabel("Hold").setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(warn, hold);

    const msg = await channel.send({ embeds: [embed], components: [row] });
    const collector = msg.createMessageComponentCollector({ time: durationMs });

    collector.on("collect", async i => {
      if (i.user.id !== userId) return i.reply({ content: "Not your binoculars!", flags: 64 }).catch(() => {});
      if (i.customId === `lo_warn_${userId}`) {
        await i.update({ content: "📣 Early warning! Crew moves safer.", components: [], embeds: [] });
        setTaskResult(guildId, userId, { status: "success", score: 1 });
      } else {
        const okRoll = Math.random() < 0.5;
        if (okRoll) {
          await i.update({ content: "🕰️ Perfect timing! Clean window.", components: [], embeds: [] });
          setTaskResult(guildId, userId, { status: "success", score: 1 });
        } else {
          await i.update({ content: "🚨 Too late! Patrol spotted movement.", components: [], embeds: [] });
          setTaskResult(guildId, userId, { status: "fail", score: 0 });
        }
      }
      collector.stop("done");
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "done") {
        setTaskResult(guildId, userId, { status: "timeout", score: 0 });
        await msg.edit({ content: "⏳ Lookout missed the window. Risk increased.", components: [], embeds: [] }).catch(() => {});
      }
      resolve();
    });
  });
}
