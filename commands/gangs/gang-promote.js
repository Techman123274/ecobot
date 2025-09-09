import { SlashCommandBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-promote")
  .setDescription("Promote or change a member’s role in your gang.")
  .addUserOption(opt =>
    opt.setName("user").setDescription("User to promote").setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("role").setDescription("New role for this member").setRequired(true)
      .addChoices(
        { name: "Leader", value: "leader" },
        { name: "Runner", value: "runner" },
        { name: "Trapper", value: "trapper" },
        { name: "Shooter", value: "shooter" },
        { name: "Eco", value: "eco" }
      )
  );

export async function execute(interaction) {
  const user = interaction.options.getUser("user");
  const newRole = interaction.options.getString("role");

  const gang = await Gang.findOne({ leaderId: interaction.user.id });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not a gang leader.", flags: MessageFlags.Ephemeral });
  }

  const member = gang.members.find(m => m.userId === user.id);
  if (!member) {
    return interaction.reply({ content: "❌ That user is not in your gang.", flags: MessageFlags.Ephemeral });
  }

  if (newRole === "leader") {
    if (user.id === interaction.user.id) {
      return interaction.reply({ content: "❌ You’re already the leader.", flags: MessageFlags.Ephemeral });
    }

    // demote current leader → Eco
    const currentLeader = gang.members.find(m => m.role === "leader");
    if (currentLeader) currentLeader.role = "eco";

    // promote target → Leader
    member.role = "leader";
    gang.leaderId = user.id;

    await gang.save();
    return interaction.reply(`👑 ${user.username} is now the **Leader** of **${gang.name}**! You’ve been demoted to Eco.`);
  }

  // normal role change
  member.role = newRole;
  await gang.save();

  return interaction.reply(`⬆️ ${user.username} is now a **${newRole}** in **${gang.name}**.`);
}
