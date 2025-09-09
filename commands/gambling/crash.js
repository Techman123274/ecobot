// commands/gambling/crash.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

const crashHistory = [];

export const data = new SlashCommandBuilder()
  .setName("crash")
  .setDescription("Bet on a multiplier and cash out before it crashes!")
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount to bet").setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const userId = interaction.user.id;

  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", flags: MessageFlags.Ephemeral });

  // validate funds against CASH, not balance
  const cash = wallet.cash ?? 0;
  if (!Number.isFinite(bet) || bet <= 0) {
    return interaction.reply({ content: "❌ Invalid bet amount.", flags: MessageFlags.Ephemeral });
  }
  if (cash < bet) {
    return interaction.reply({ content: "❌ You don’t have enough cash for that bet.", flags: MessageFlags.Ephemeral });
  }

  // deduct bet up front (atomic)
  await Wallet.updateOne({ userId }, { $inc: { cash: -bet } });

  // pick crash point (skewed early, sometimes big)
  const crashPoint = Number((Math.pow(Math.random(), 2.5) * 80 + 1).toFixed(2));

  let multiplier = 1.0;
  let cashedOut = false;
  let winnings = 0;
  let roundOver = false;

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

  // Keep the collector alive long enough; we will stop it manually at round end
  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === "cashout",
    time: 120_000, // 2 minutes max safeguard
  });

  const stopRound = async (reason) => {
    if (roundOver) return;
    roundOver = true;
    clearInterval(tickTimer);
    collector.stop(reason);

    // disable button
    const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(cashBtn).setDisabled(true));

    if (!cashedOut) {
      // Player lost
      const lost = new EmbedBuilder()
        .setTitle("💥 CRASHED!")
        .setColor("Red")
        .setDescription(
          `🎮 Player: <@${userId}>\n` +
          `💰 Bet: **${bet}**\n\n` +
          `Multiplier crashed at **${crashPoint.toFixed(2)}x**!\n` +
          `❌ Lost all coins.`
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
      await interaction.editReply({ embeds: [ended], components: [disabledRow] });
    }
  };

  // growth loop — slightly faster so 3x doesn’t align with collector timeout
  const tickTimer = setInterval(async () => {
    if (roundOver) return;

    multiplier *= 1.035 + Math.random() * 0.02; // ~3.5%–5.5% per tick
    // check crash
    if (multiplier >= crashPoint) {
      await stopRound("crash");
      return;
    }

    // live UI update only if not cashed
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
  }, 1000); // 1s ticks

  collector.on("collect", async (i) => {
    if (roundOver || cashedOut) return;
    cashedOut = true;

    winnings = Math.max(0, Math.floor(bet * multiplier));
    // pay winnings (atomic)
    await Wallet.updateOne({ userId }, { $inc: { cash: winnings } });

    // acknowledge & show immediate cashout
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

    await i.update({ embeds: [cashed], components: [] });

    // Let the round continue until it actually crashes, then show final summary.
    // If you prefer to end instantly after cashout, call stopRound("cashed") here.
  });

  collector.on("end", async (_collected, reason) => {
    // If time ran out but round still not over, end gracefully
    if (!roundOver && reason === "time") {
      await stopRound("timeout");
    }
  });
}

function updateHistory(mult) {
  crashHistory.unshift(`${Number(mult).toFixed(2)}x`);
  if (crashHistory.length > 5) crashHistory.pop();
  return crashHistory.join(" • ");
}
