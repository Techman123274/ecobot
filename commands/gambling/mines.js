import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("mines")
  .setDescription("Play Minesweeper with your bet")
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount to bet").setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName("mines").setDescription("How many mines (1–5)").setRequired(true)
  );

export async function execute(interaction) {
  const bet = interaction.options.getInteger("amount");
  const mineCount = interaction.options.getInteger("mines");
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) return interaction.reply({ content: "❌ You need a wallet. Use `/create` first!", flags: 64 });
  if (bet <= 0 || wallet.balance < bet) return interaction.reply({ content: "❌ Invalid bet amount.", flags: 64 });
  if (mineCount < 1 || mineCount > 5) return interaction.reply({ content: "❌ Mines must be between 1 and 5.", flags: 64 });

  // Deduct bet upfront
  wallet.balance -= bet;
  await wallet.save();

  // Game setup (3x3 grid)
  const gridSize = 9;
  const tiles = Array(gridSize).fill("safe");
  const minePositions = new Set();
  while (minePositions.size < mineCount) {
    minePositions.add(Math.floor(Math.random() * gridSize));
  }
  minePositions.forEach(i => tiles[i] = "mine");

  let revealed = [];
  let multiplier = 1.0;
  let gameOver = false;

  const makeGrid = () => {
    const rows = [];
    for (let row = 0; row < 3; row++) {
      const actionRow = new ActionRowBuilder();
      for (let col = 0; col < 3; col++) {
        const idx = row * 3 + col;
        const btn = new ButtonBuilder()
          .setCustomId(`tile_${idx}`)
          .setLabel(
            revealed.includes(idx)
              ? (tiles[idx] === "mine" ? "💥" : "💎")
              : "❓"
          )
          .setStyle(revealed.includes(idx) ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(gameOver || revealed.includes(idx));
        actionRow.addComponents(btn);
      }
      rows.push(actionRow);
    }

    if (!gameOver && revealed.length > 0) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("cashout")
            .setLabel("💸 Cash Out")
            .setStyle(ButtonStyle.Success)
        )
      );
    }

    return rows;
  };

  const embed = new EmbedBuilder()
    .setTitle("💣 Mines Game")
    .setColor("Blue")
    .setDescription(`Bet: **${bet}** coins\nMines: **${mineCount}**\nMultiplier: **x${multiplier.toFixed(2)}**`)
    .setFooter({ text: "Click tiles to reveal or cash out to stop." });

  // First reply (this is the only reply)
  const message = await interaction.reply({ embeds: [embed], components: makeGrid() });

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 60000
  });

  collector.on("collect", async (i) => {
    if (i.customId.startsWith("tile_")) {
      const idx = parseInt(i.customId.split("_")[1]);

      if (tiles[idx] === "mine") {
        revealed.push(idx);
        gameOver = true;

        const loseEmbed = new EmbedBuilder()
          .setTitle("💥 Boom! You hit a mine")
          .setColor("Red")
          .setDescription(`❌ You lost your bet of **${bet} coins**.`);

        await i.update({ embeds: [loseEmbed], components: makeGrid() });
        collector.stop("lost");
      } else {
        revealed.push(idx);
        multiplier += 0.5;

        const safeEmbed = new EmbedBuilder()
          .setTitle("💎 Safe!")
          .setColor("Green")
          .setDescription(
            `Multiplier: **x${multiplier.toFixed(2)}**\n💰 Potential cashout: **${Math.floor(bet * multiplier)} coins**`
          )
          .setFooter({ text: "Keep going or cash out!" });

        await i.update({ embeds: [safeEmbed], components: makeGrid() });
      }
    }

    if (i.customId === "cashout") {
      gameOver = true;
      collector.stop("cashed");

      const winnings = Math.floor(bet * multiplier);
      wallet.balance += winnings;
      await wallet.save();

      const cashEmbed = new EmbedBuilder()
        .setTitle("✅ Cashed Out!")
        .setColor("Green")
        .setDescription(`You cashed out at x${multiplier.toFixed(2)}!\n💰 Winnings: **${winnings} coins**.`);

      await i.update({ embeds: [cashEmbed], components: [] });
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time" && !gameOver) {
      const timeoutEmbed = new EmbedBuilder()
        .setTitle("⌛ Game Over")
        .setColor("Yellow")
        .setDescription("You ran out of time! Bet lost.");
      await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
    }
  });
}
