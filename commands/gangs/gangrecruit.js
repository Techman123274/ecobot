import { SlashCommandBuilder } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-recruit")
  .setDescription("Recruit an NPC (fake) gang member")
  .addStringOption(opt =>
    opt.setName("role").setDescription("Role for NPC").setRequired(true)
      .addChoices(
        { name: "Runner", value: "runner" },
        { name: "Trapper", value: "trapper" },
        { name: "Shooter", value: "shooter" },
        { name: "Eco", value: "eco" }
      )
  )
  .addStringOption(opt =>
    opt.setName("name").setDescription("NPC member name").setRequired(true)
  );

export async function execute(interaction) {
  const role = interaction.options.getString("role");
  const name = interaction.options.getString("name");
  const gang = await Gang.findOne({ leaderId: interaction.user.id });

  if (!gang) return interaction.reply("❌ You are not a gang leader.");

  gang.members.push({ fake: true, name, role });
  await gang.save();

  return interaction.reply(`👥 Recruited NPC **${name}** as a **${role}** for gang **${gang.name}**.`);
}
