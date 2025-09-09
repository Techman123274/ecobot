import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("dice")
  .setDescription("Roll the dice against the bot")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("Amount to bet")
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

  // Roll dice
  const userRoll = Math.floor(Math.random() * 6) + 1;
  const botRoll = Math.floor(Math.random() * 6) + 1;

  let result;
  let color;

  if (userRoll > botRoll) {
    wallet.balance += bet;
    result = `🎉 You win! Your roll: **${userRoll}** vs Bot: **${botRoll}**\n💰 You earned **${bet} coins**.`;
    color = "Green";
  } else if (userRoll < botRoll) {
    wallet.balance -= bet;
    result = `💀 You lose! Your roll: **${userRoll}** vs Bot: **${botRoll}**\n❌ You lost **${bet} coins**.`;
    color = "Red";
  } else {
    result = `🤝 It's a tie! Both rolled **${userRoll}**.\nYour bet is returned.`;
    color = "Yellow";
  }

  await wallet.save();

  const embed = new EmbedBuilder()
    .setTitle("🎲 Dice Game")
    .setColor(color)
    .setDescription(result)
    .setFooter({ text: `Bet: ${bet} coins` });

  return interaction.reply({ embeds: [embed] });
}
