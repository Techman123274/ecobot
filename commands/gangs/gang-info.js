import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const data = new SlashCommandBuilder()
  .setName("gang-info")
  .setDescription("View information about your gang or another gang.")
  .addStringOption(opt =>
    opt.setName("name")
      .setDescription("Optional: Gang name to check")
      .setRequired(false)
  );

export async function execute(interaction) {
  const queryName = interaction.options.getString("name");

  let gang;
  if (queryName) {
    gang = await Gang.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(queryName)}$`, "i") },
    });
    if (!gang) {
      return interaction.reply({
        content: "❌ No gang found with that name.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    gang = await Gang.findOne({ "members.userId": interaction.user.id });
    if (!gang) {
      return interaction.reply({
        content: "❌ You are not in a gang. Use `/gang-create` to start one.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // pull leader
  const leader = gang.members.find(m => m.role === "leader");

  // format members
  const memberList =
    gang.members.length > 0
      ? gang.members
          .map(m => {
            const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
            const display = m.fake
              ? `🤖 ${m.name || "NPC"}`
              : `👤 <@${m.userId}>`;
            return `${display} — *${role}*`;
          })
          .join("\n")
      : "No members";

  // stash safe defaults
  const stash = {
    weed: gang.stash?.weed || 0,
    cocaine: gang.stash?.cocaine || 0,
    heroin: gang.stash?.heroin || 0,
    guns: gang.stash?.guns || 0,
  };

  const embed = new EmbedBuilder()
    .setTitle(`🏴 Gang Info — ${gang.name}`)
    .setColor("DarkPurple")
    .setDescription(
      `👑 Leader: <@${gang.leaderId}>\n` +
      `💰 Treasury: $${gang.treasury.toLocaleString()}\n` +
      `🔥 Heat: ${gang.heat}\n` +
      `⭐ Respect: ${gang.respect}`
    )
    .addFields(
      {
        name: "📦 Stash",
        value:
          `Weed: ${stash.weed}\n` +
          `Cocaine: ${stash.cocaine}\n` +
          `Heroin: ${stash.heroin}\n` +
          `🔫 Guns: ${stash.guns}`,
        inline: true,
      },
      { name: "👥 Members", value: memberList, inline: true }
    )
    .setFooter({ text: "Gang Empire System" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}
