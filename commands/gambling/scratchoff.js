import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Symbols & payout multipliers
const symbols = ["🍀", "💎", "🎰", "🔥", "💀"];
const payouts = {
  "🍀": 2,   // 3 clovers = 2x bet
  "💎": 5,   // 3 diamonds = 5x
  "🎰": 10,  // 3 slots = 10x
  "🔥": 20,  // 3 fire = 20x
  "💀": 0    // 3 skulls = instant loss
};

export const data = new SlashCommandBuilder()
  .setName("scratchoff")
  .setDescription("Buy a scratch-off ticket and reveal your luck")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Ticket price / bet amount")
      .setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  }
  if (bet <= 0 || wallet.balance < bet) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  // Deduct upfront
  wallet.balance -= bet;
  await wallet.save();

  // Generate 3 random symbols
  const results = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);

  // Check if all match
  let winnings = 0;
  if (results[0] === results[1] && results[1] === results[2]) {
    winnings = bet * (payouts[results[0]] || 0);
    wallet.balance += winnings;
    await wallet.save();
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("reveal").setLabel("🎟️ Scratch Card").setStyle(ButtonStyle.Primary)
  );

  const initialEmbed = new EmbedBuilder()
    .setTitle("🎟️ Scratch-Off Ticket")
    .setColor("Gold")
    .setDescription(`Bet: **${bet} coins**\n\nPress the button to scratch your card!`);

  const msg = await interaction.reply({ embeds: [initialEmbed], components: [row], fetchReply: true });

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 15000,
    max: 1
  });

  collector.on("collect", async (i) => {
    const resultEmbed = new EmbedBuilder()
      .setTitle("🎟️ Scratch-Off Results")
      .setDescription(results.join(" | "))
      .setColor(winnings > 0 ? "Green" : "Red")
      .addFields(
        winnings > 0
          ? { name: "Result", value: `🎉 You won **${winnings} coins**!` }
          : { name: "Result", value: "💀 No luck this time. You lost your bet." }
      )
      .setFooter({ text: "Better luck next time!" });

    await i.update({ embeds: [resultEmbed], components: [] });
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("⌛ Scratch-Off Expired").setColor("Grey").setDescription("You didn’t scratch your ticket in time.")],
        components: []
      });
    }
  });
}
