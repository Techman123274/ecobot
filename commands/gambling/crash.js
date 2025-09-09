import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// keep last 5 crash multipliers in memory
const crashHistory = [];

export const data = new SlashCommandBuilder()
  .setName("crash")
  .setDescription("Bet on a multiplier and cash out before it crashes!")
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount to bet").setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  if (bet <= 0 || wallet.balance < bet) return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });

  // Deduct bet upfront
  wallet.balance -= bet;
  await wallet.save();

  // Crash point (biased toward early, but sometimes big)
  const crashPoint = (Math.pow(Math.random(), 2.5) * 80 + 1).toFixed(2);
  let multiplier = 1.0;
  let cashedOut = false;
  let winnings = 0;

  // UI
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cashout")
      .setLabel("💸 Cash Out")
      .setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle("📈 Crash Game")
    .setColor("Blue")
    .setDescription(
      `🎮 Player: <@${interaction.user.id}>\n💰 Bet: **${bet} coins**\n\nMultiplier: **${multiplier.toFixed(2)}x**`
    )
    .addFields({ name: "Recent Crashes", value: crashHistory.join(" • ") || "None yet" })
    .setFooter({ text: "Cash out before it crashes!" });

  await interaction.reply({ embeds: [embed], components: [row] });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 30000
  });

  // growth loop
  const interval = setInterval(async () => {
    multiplier *= 1.05 + Math.random() * 0.02;

    // Crash check
    if (multiplier >= crashPoint) {
      clearInterval(interval);
      collector.stop("crash");

      // If player didn’t cash out → lose
      if (!cashedOut) {
        const lostEmbed = new EmbedBuilder()
          .setTitle("💥 CRASHED!")
          .setColor("Red")
          .setDescription(
            `🎮 Player: <@${interaction.user.id}>\n💰 Bet: **${bet} coins**\n\nMultiplier crashed at **${crashPoint}x**!\n❌ Lost all coins.`
          )
          .addFields({ name: "Recent Crashes", value: updateHistory(crashPoint) });

        await interaction.editReply({ embeds: [lostEmbed], components: [] });
      } else {
        // Player cashed out → just show final crash
        const finalEmbed = new EmbedBuilder()
          .setTitle("💥 Round Ended")
          .setColor("Orange")
          .setDescription(
            `🎮 Player: <@${interaction.user.id}>\n💰 Bet: **${bet} coins**\n\n✅ Cashed Out at **${multiplier.toFixed(
              2
            )}x**\n💸 Winnings: **${winnings} coins**\n\n💥 Crash hit at **${crashPoint}x**`
          )
          .addFields({ name: "Recent Crashes", value: updateHistory(crashPoint) });

        await interaction.editReply({ embeds: [finalEmbed], components: [] });
      }
    } else if (!cashedOut) {
      // live updating embed until crash
      const updateEmbed = new EmbedBuilder()
        .setTitle("📈 Crash Game")
        .setColor("Blue")
        .setDescription(
          `🎮 Player: <@${interaction.user.id}>\n💰 Bet: **${bet} coins**\n\nMultiplier: **${multiplier.toFixed(
            2
          )}x**`
        )
        .addFields({ name: "Recent Crashes", value: crashHistory.join(" • ") || "None yet" });

      await interaction.editReply({ embeds: [updateEmbed], components: [row] });
    }
  }, 1200);

  // Cash out handler
  collector.on("collect", async (i) => {
    if (i.customId === "cashout" && !cashedOut) {
      cashedOut = true;
      winnings = Math.floor(bet * multiplier);
      wallet.balance += winnings;
      await wallet.save();

      const cashoutEmbed = new EmbedBuilder()
        .setTitle("✅ Cashed Out!")
        .setColor("Green")
        .setDescription(
          `🎮 Player: <@${interaction.user.id}>\n💰 Bet: **${bet} coins**\n\nCashed out at **${multiplier.toFixed(
            2
          )}x**\n💸 Winnings: **${winnings} coins**`
        )
        .addFields({ name: "Recent Crashes", value: crashHistory.join(" • ") || "None yet" });

      await i.update({ embeds: [cashoutEmbed], components: [] });
    }
  });
}

// Helper to update crash history
function updateHistory(multiplier) {
  crashHistory.unshift(multiplier + "x");
  if (crashHistory.length > 5) crashHistory.pop();
  return crashHistory.join(" • ");
}
