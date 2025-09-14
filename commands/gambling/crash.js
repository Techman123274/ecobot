// commands/gambling/crash.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";

const CURRENCY_FIELD = "balance"; // spend & pay from wallet.balance
const crashHistory = [];

export const data = new SlashCommandBuilder()
  .setName("crash")
  .setDescription("Bet on a multiplier and cash out before it crashes!")
  .addIntegerOption((opt) =>
    opt.setName("amount").setDescription("Amount to bet").setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const userId = interaction.user.id;

  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet) {
    return interaction.reply({
      content: "❌ You need a wallet. Use `/create` first!",
      ephemeral: true,
    });
  }

  const current = Number(wallet[CURRENCY_FIELD] ?? 0);

  if (!Number.isFinite(bet) || bet <= 0) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }
  if (current < bet) {
    return interaction.reply({
      content: `❌ You don’t have enough **${CURRENCY_FIELD}** for that bet.`,
      ephemeral: true,
    });
  }

  // 1) Deduct bet upfront (atomic)
  await Wallet.updateOne({ userId }, { $inc: { [CURRENCY_FIELD]: -bet } });

  // 2) Simulate crash round
  const crashPoint = Number((Math.pow(Math.random(), 2.5) * 80 + 1).toFixed(2));

  let multiplier = 1.0;
  let cashedOut = false;
  let winnings = 0;
  let roundOver = false;
  let statsRecorded = false; // ensure we only write stats once

  const cashBtn = new ButtonBuilder()
    .setCustomId("cashout")
    .setLabel("💸 Cash Out")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(cashBtn);

  const embed = new EmbedBuilder()
    .setTitle("📈 Crash")
    .setColor("Blue")
    .setDescription(
      `🎮 Player: <@${userId}>\n` +
        `💰 Bet: **${bet}**\n\n` +
        `Multiplier: **${multiplier.toFixed(2)}x**`
    )
    .addFields({ name: "Recent Crashes", value: crashHistory.join(" • ") || "None yet" })
    .setFooter({ text: "Cash out before it crashes!" });

  await interaction.reply({ embeds: [embed], components: [row] });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === "cashout",
    time: 120_000,
  });

  // Helper to write stats exactly once at end of round
  async function recordStats() {
    if (statsRecorded) return;
    statsRecorded = true;

    const inc = { totalBets: 1, totalWagered: bet };
    const set = { lastGame: "crash" };
    const max = {};

    if (cashedOut) {
      const profit = Math.max(0, winnings - bet);
      inc.totalWon = profit;
      max.biggestWin = profit;
    } else {
      inc.totalLost = bet;
      max.biggestLoss = bet;
    }

    await Wallet.updateOne(
      { userId },
      {
        $inc: inc,
        $set: set,
        ...(Object.keys(max).length ? { $max: max } : {}),
      }
    );
  }

  const stopRound = async (reason) => {
    if (roundOver) return;
    roundOver = true;
    clearInterval(tickTimer);
    collector.stop(reason);

    await recordStats();

    const disabledRow = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(cashBtn).setDisabled(true)
    );

    if (!cashedOut) {
      const lost = new EmbedBuilder()
        .setTitle("💥 CRASHED!")
        .setColor("Red")
        .setDescription(
          `🎮 Player: <@${userId}>\n` +
            `💰 Bet: **${bet}**\n\n` +
            `Multiplier crashed at **${crashPoint.toFixed(2)}x**!\n` +
            `❌ Lost your bet.`
        )
        .addFields({ name: "Recent Crashes", value: updateHistory(crashPoint) });

      await interaction.editReply({ embeds: [lost], components: [disabledRow] });
    } else {
      const ended = new EmbedBuilder()
        .setTitle("💥 Round Ended")
        .setColor("Orange")
        .setDescription(
          `🎮 Player: <@${userId}>\n` +
            `💰 Bet: **${bet}**\n\n` +
            `✅ Cashed Out at **${multiplier.toFixed(2)}x**\n` +
            `💸 Winnings: **${winnings}**\n\n` +
            `💥 Crash hit at **${crashPoint.toFixed(2)}x**`
        )
        .addFields({ name: "Recent Crashes", value: updateHistory(crashPoint) });

      // keep components removed if we already removed them on cashout
      await interaction.editReply({ embeds: [ended], components: [] });
    }
  };

  // Multiplier growth loop
  const tickTimer = setInterval(async () => {
    if (roundOver) return;

    multiplier *= 1.035 + Math.random() * 0.02; // ~3.5%–5.5% per second

    if (multiplier >= crashPoint) {
      await stopRound("crash");
      return;
    }

    if (!cashedOut) {
      const live = new EmbedBuilder()
        .setTitle("📈 Crash")
        .setColor("Blue")
        .setDescription(
          `🎮 Player: <@${userId}>\n` +
            `💰 Bet: **${bet}**\n\n` +
            `Multiplier: **${multiplier.toFixed(2)}x**`
        )
        .addFields({ name: "Recent Crashes", value: crashHistory.join(" • ") || "None yet" });

      await interaction.editReply({ embeds: [live], components: [row] });
    }
  }, 1000);

  collector.on("collect", async (i) => {
    if (roundOver || cashedOut) return;
    cashedOut = true;

    winnings = Math.max(0, Math.floor(bet * multiplier));

    // 3) Pay winnings immediately (atomic)
    await Wallet.updateOne({ userId }, { $inc: { [CURRENCY_FIELD]: winnings } });

    const cashed = new EmbedBuilder()
      .setTitle("✅ Cashed Out!")
      .setColor("Green")
      .setDescription(
        `🎮 Player: <@${userId}>\n` +
          `💰 Bet: **${bet}**\n\n` +
          `Cashed out at **${multiplier.toFixed(2)}x**\n` +
          `💸 Winnings: **${winnings}**`
      )
      .addFields({ name: "Recent Crashes", value: crashHistory.join(" • ") || "None yet" });

    // remove button immediately after cashout
    await i.update({ embeds: [cashed], components: [] });
    // final summary comes when round ends (stopRound)
  });

  collector.on("end", async (_collected, reason) => {
    if (!roundOver) {
      // If collector timed out but round is still running, end gracefully
      await stopRound(reason || "timeout");
    }
  });
}

function updateHistory(mult) {
  crashHistory.unshift(`${Number(mult).toFixed(2)}x`);
  if (crashHistory.length > 5) crashHistory.pop();
  return crashHistory.join(" • ");
}
