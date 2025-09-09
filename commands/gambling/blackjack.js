import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

// Helper: draw a random card
function drawCard() {
  const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];
  const suits = ["♠", "♥", "♦", "♣"];
  const value = values[Math.floor(Math.random() * values.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  return { value, suit };
}

// Helper: calculate hand total
function calculateTotal(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (["J", "Q", "K"].includes(card.value)) {
      total += 10;
    } else if (card.value === "A") {
      total += 11;
      aces++;
    } else {
      total += card.value;
    }
  }

  // Handle aces being 1 or 11
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Play a game of blackjack vs the bot")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Amount to bet")
      .setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", ephemeral: true });
  if (bet <= 0 || wallet.balance < bet) {
    return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
  }

  // Initial hands
  const playerHand = [drawCard(), drawCard()];
  const dealerHand = [drawCard(), drawCard()];

  const embed = new EmbedBuilder()
    .setTitle("🃏 Blackjack")
    .setColor("Green")
    .setDescription(`Bet: **${bet} coins**`)
    .addFields(
      { name: `${interaction.user.username}'s Hand`, value: formatHand(playerHand, true), inline: true },
      { name: "Dealer's Hand", value: `${dealerHand[0].value}${dealerHand[0].suit} ▓`, inline: true }
    )
    .setFooter({ text: "Click Hit or Stand to play." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Danger)
  );

  const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 60000
  });

  collector.on("collect", async (i) => {
    if (i.customId === "hit") {
      playerHand.push(drawCard());
      const playerTotal = calculateTotal(playerHand);

      if (playerTotal > 21) {
        wallet.balance -= bet;
        await wallet.save();
        collector.stop("bust");

        return i.update({
          embeds: [new EmbedBuilder()
            .setTitle("💥 Bust!")
            .setColor("Red")
            .setDescription(`You went over 21 with ${formatHand(playerHand)}.\n\n❌ You lost **${bet} coins**.`)
          ],
          components: []
        });
      }

      const updated = new EmbedBuilder()
        .setTitle("🃏 Blackjack")
        .setColor("Green")
        .setDescription(`Bet: **${bet} coins**`)
        .addFields(
          { name: `${interaction.user.username}'s Hand`, value: formatHand(playerHand, true), inline: true },
          { name: "Dealer's Hand", value: `${dealerHand[0].value}${dealerHand[0].suit} ▓`, inline: true }
        );

      return i.update({ embeds: [updated], components: [row] });
    }

    if (i.customId === "stand") {
      collector.stop("stand");

      let dealerTotal = calculateTotal(dealerHand);
      while (dealerTotal < 17) {
        dealerHand.push(drawCard());
        dealerTotal = calculateTotal(dealerHand);
      }

      const playerTotal = calculateTotal(playerHand);
      let result;
      let color;

      if (dealerTotal > 21 || playerTotal > dealerTotal) {
        wallet.balance += bet;
        result = `🎉 You win! Dealer had ${dealerTotal}. You earned **${bet} coins**.`;
        color = "Green";
      } else if (playerTotal === dealerTotal) {
        result = `🤝 It's a tie! Dealer also had ${dealerTotal}. Your bet is returned.`;
        color = "Yellow";
      } else {
        wallet.balance -= bet;
        result = `💀 You lose! Dealer had ${dealerTotal}. You lost **${bet} coins**.`;
        color = "Red";
      }

      await wallet.save();

      return i.update({
        embeds: [new EmbedBuilder()
          .setTitle("🃏 Blackjack - Result")
          .setColor(color)
          .setDescription(result)
          .addFields(
            { name: `${interaction.user.username}'s Hand`, value: `${formatHand(playerHand)} (${playerTotal})`, inline: true },
            { name: "Dealer's Hand", value: `${formatHand(dealerHand)} (${dealerTotal})`, inline: true }
          )
        ],
        components: []
      });
    }
  });

  collector.on("end", (collected, reason) => {
    if (reason === "time") {
      interaction.editReply({ content: "⌛ Game timed out!", components: [] });
    }
  });
}

// Format hand into string
function formatHand(hand, hideTotal = false) {
  const total = calculateTotal(hand);
  const cards = hand.map(c => `${c.value}${c.suit}`).join(" ");
  return hideTotal ? `${cards} (${total})` : `${cards}`;
}
