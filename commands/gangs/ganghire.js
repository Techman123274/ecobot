import { SlashCommandBuilder } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-hire")
  .setDescription("Hire a real player into your gang")
  .addUserOption(opt =>
    opt.setName("user").setDescription("User to hire").setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("role").setDescription("Role for this member").setRequired(true)
      .addChoices(
        { name: "Runner", value: "runner" },
        { name: "Trapper", value: "trapper" },
        { name: "Shooter", value: "shooter" },
        { name: "Eco", value: "eco" }
      )
  );

export async function execute(interaction) {
  const user = interaction.options.getUser("user");
  const role = interaction.options.getString("role");

  const gang = await Gang.findOne({ leaderId: interaction.user.id });
  if (!gang) return interaction.reply("❌ You are not a gang leader.");

  // prevent double-hiring
  const already = await Gang.findOne({ "members.userId": user.id });
  if (already) return interaction.reply("❌ That user is already in another gang.");

  gang.members.push({ userId: user.id, name: user.username, role, fake: false });
  await gang.save();

  return interaction.reply(`👥 Hired ${user} as a **${role}** in **${gang.name}**.`);
}
