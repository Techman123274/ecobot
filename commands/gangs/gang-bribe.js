import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-bribe")
  .setDescription("Spend money and respect to reduce gang heat fast.");

export async function execute(interaction) {
  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  if (gang.treasury < 1000 || gang.respect < 10) {
    return interaction.reply({ content: "❌ Need at least $1000 treasury and 10 respect.", flags: MessageFlags.Ephemeral });
  }

  gang.treasury -= 1000;
  gang.respect -= 10;
  gang.heat = Math.max(0, gang.heat - 20);
  await gang.save();

  const embed = new EmbedBuilder()
    .setTitle("💵 Bribe Successful")
    .setColor("Gold")
    .setDescription(`You bribed the cops.\n🔥 Heat reduced by 20.\n💰 Treasury: $${gang.treasury}\n⭐ Respect: ${gang.respect}`);

  return interaction.reply({ embeds: [embed] });
}
