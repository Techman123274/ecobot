import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-laylow")
  .setDescription("Spend money to lower gang heat.");

export async function execute(interaction) {
  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  if (gang.treasury < 500) {
    return interaction.reply({ content: "💸 Not enough money (need $500).", flags: MessageFlags.Ephemeral });
  }

  gang.treasury -= 500;
  gang.heat = Math.max(0, gang.heat - 10);
  await gang.save();

  const embed = new EmbedBuilder()
    .setTitle("😎 Lay Low")
    .setColor("Blue")
    .setDescription(`Your gang laid low. Heat reduced by 10.\n🔥 Current Heat: ${gang.heat}\n💰 Treasury: $${gang.treasury}`);

  return interaction.reply({ embeds: [embed] });
}
