import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";


export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the top players")
  .addStringOption(option =>
    option
      .setName("type")
      .setDescription("Choose leaderboard type")
      .setRequired(false)
      .addChoices(
        { name: "Balance", value: "balance" },
        { name: "XP", value: "xp" },
        { name: "Level", value: "level" }
      )
  );

export async function execute(interaction) {
  const type = interaction.options.getString("type") || "balance";

  // Get top 10 sorted by chosen field
  const top = await Wallet.find().sort({ [type]: -1 }).limit(10);

  if (!top.length) {
    return interaction.reply("❌ No players found in the leaderboard.");
  }

  let desc = "";
  for (let i = 0; i < top.length; i++) {
    const user = await interaction.client.users.fetch(top[i].userId).catch(() => null);
    const username = user ? user.username : "Unknown User";

    desc += `**#${i + 1}** — ${username} • ${type === "balance" ? `${top[i].balance} coins` : top[i][type]}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Leaderboard")
    .setDescription(desc)
    .setColor("Purple");

  await interaction.reply({ embeds: [embed] });
}
