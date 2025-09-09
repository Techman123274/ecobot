import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-stash")
  .setDescription("View your gang’s stash and members.");

export async function execute(interaction) {
  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  // Safely extract stash values
  const drugs = gang.stash?.drugs || {};
  const weed = drugs.weed || 0;
  const cocaine = drugs.cocaine || 0;
  const heroin = drugs.heroin || 0;
  const meth = drugs.meth || 0;

  const guns = gang.stash?.guns?.length
    ? gang.stash.guns.map(g => `${g.type} (💥 ${g.durability})`).join(", ")
    : "None";

  const membersList = gang.members.length
    ? gang.members.map(m => `${m.fake ? "🕶️ NPC" : "👤"} **${m.name}** — ${m.role}`).join("\n")
    : "No members";

  const embed = new EmbedBuilder()
    .setTitle(`🏴 ${gang.name} Gang Stash`)
    .setColor("DarkPurple")
    .addFields(
      { name: "🌿 Weed", value: weed.toString(), inline: true },
      { name: "💎 Cocaine", value: cocaine.toString(), inline: true },
      { name: "💉 Heroin", value: heroin.toString(), inline: true },
      { name: "⚗️ Meth", value: meth.toString(), inline: true },
      { name: "🔫 Guns", value: guns, inline: false },
      { name: "💰 Treasury", value: `$${(gang.treasury || 0).toLocaleString()}`, inline: true },
      { name: "🔥 Heat", value: (gang.heat || 0).toString(), inline: true }
    )
    .addFields({
      name: "👥 Members",
      value: membersList
    });

  return interaction.reply({ embeds: [embed] });
}
