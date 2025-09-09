import { SlashCommandBuilder, MessageFlags } from "discord.js";
import mongoose from "mongoose";
import Gang from "../../src/database/Gang.js";
import GangInvite from "../../src/database/GangInvite.js";

export const data = new SlashCommandBuilder()
  .setName("gang-invite")
  .setDescription("Invite a user to your gang")
  .addUserOption(opt =>
    opt.setName("user").setDescription("User to invite").setRequired(true)
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
  if (!gang) {
    return interaction.reply({ content: "❌ You are not a gang leader.", flags: MessageFlags.Ephemeral });
  }

  const existingMember = await Gang.findOne({ "members.userId": user.id });
  if (existingMember) {
    return interaction.reply({ content: "❌ That user is already in a gang.", flags: MessageFlags.Ephemeral });
  }

  const existingInvite = await GangInvite.findOne({ userId: user.id, gangId: gang._id });
  if (existingInvite) {
    return interaction.reply({ content: "❌ That user already has a pending invite to your gang.", flags: MessageFlags.Ephemeral });
  }

  const invite = new GangInvite({
    gangId: gang._id,
    userId: user.id,
    role,
    invitedBy: interaction.user.id
  });

  await invite.save();

  return interaction.reply(`📨 Invite sent to ${user}. They must use \`/gang-accept\` or \`/gang-decline\`.`);
}
