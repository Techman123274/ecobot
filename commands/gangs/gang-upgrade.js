import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

const upgradesConfig = {
  stash: { name: "📦 Stash Size", baseCost: 5000, scale: 1.5 },
  shooter: { name: "🔫 Shooter Accuracy", baseCost: 8000, scale: 1.7 },
  runner: { name: "🏃 Runner Speed", baseCost: 6000, scale: 1.6 },
};

export const data = new SlashCommandBuilder()
  .setName("gang-upgrade")
  .setDescription("Purchase gang upgrades (leader/eco only).")
  .addStringOption(opt =>
    opt.setName("type")
      .setDescription("Upgrade type")
      .setRequired(true)
      .addChoices(
        { name: "📦 Stash Size", value: "stash" },
        { name: "🔫 Shooter Accuracy", value: "shooter" },
        { name: "🏃 Runner Speed", value: "runner" },
      )
  );

export async function execute(interaction) {
  const type = interaction.options.getString("type");
  const userId = interaction.user.id;

  const gang = await Gang.findOne({ "members.userId": userId });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  // check role
  const member = gang.members.find(m => m.userId === userId);
  if (!member || !["leader", "eco"].includes(member.role)) {
    return interaction.reply({
      content: "❌ Only the Leader or Eco can purchase upgrades.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // config + current level
  const config = upgradesConfig[type];
  if (!config) {
    return interaction.reply({ content: "❌ Invalid upgrade type.", flags: MessageFlags.Ephemeral });
  }

  const currentLevel = gang.upgrades?.[type] || 0;
  const cost = Math.floor(config.baseCost * Math.pow(config.scale, currentLevel));

  if (gang.treasury < cost) {
    return interaction.reply({
      content: `❌ Treasury does not have enough funds. Need 💵 $${cost.toLocaleString()}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Deduct treasury + upgrade
  gang.treasury -= cost;
  gang.upgrades[type] = currentLevel + 1;

  await gang.save();

  const embed = new EmbedBuilder()
    .setTitle("🏴 Gang Upgrade Purchased")
    .setColor("Gold")
    .setDescription(
      `✅ **${config.name}** upgraded to level **${currentLevel + 1}**!\n` +
      `💵 Cost: $${cost.toLocaleString()}\n` +
      `📦 Treasury Left: $${gang.treasury.toLocaleString()}`
    )
    .setFooter({ text: "Gang Empire System" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}
