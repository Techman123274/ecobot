// commands/gambling/crash.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";

const crashHistory = [];

// Prefer xcash, but fall back if your model uses another key
const CURRENCY_CANDIDATES = [
  "xcash",
  "xCash",
  "cash",
  "balances.xcash",
  "balances.cash",
];

const get = (obj, path) =>
  path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);

const pickCurrencyField = (walletDoc) => {
  for (const p of CURRENCY_CANDIDATES) {
    const v = get(walletDoc, p);
    if (typeof v === "number") return p;
  }
  return "xcash"; // final fallback
};

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
  if (!wallet)
    return interaction.reply({
      content: "❌ You need a wallet. Use `/create` first!",
      ephemeral: true,
    });

  // ✅ use the right currency field (xcash preferred)
  const currencyField = pickCurrencyField(wallet);
  const current = Number(get(wallet, currencyField) ?? 0);

  if (!Number.isFinite(bet) || bet <= 0) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }
  if (current < bet) {
    const label = currencyField.replace(/^balances\./, "");
    return interaction.reply({
      content: `❌ You don’t have enough **${label}** for that bet.`,
      ephemeral: true,
    });
  }

  // deduct bet up front (atomic) from the resolved field (usually xcash)
  await Wallet.updateOne({ userId }, { $inc: { [currencyField]: -bet } });

  // pick crash point (skew early, sometimes big)
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

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === "cashout",
    time: 120_000,
  });

  const stopRound = async (reason) => {
    if (roundOver) return;
    roundOver = true;
    clearInterval(tickTimer);
    collector.stop(reason);

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

  const tickTimer = setInterval(async () => {
    if (roundOver) return;

    multiplier *= 1.035 + Math.random() * 0.02;
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
    await Wallet.updateOne({ userId }, { $inc: { [currencyField]: winnings } });

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
    // leave round running until it actually crashes; summary shown in stopRound()
  });

  collector.on("end", async (_collected, reason) => {
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
