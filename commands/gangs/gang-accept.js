import { SlashCommandBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";
import GangInvite from "../../src/database/GangInvite.js";

export const data = new SlashCommandBuilder()
  .setName("gang-accept")
  .setDescription("Accept a gang invite");

export async function execute(interaction) {
  const invite = await GangInvite.findOne({ userId: interaction.user.id });
  if (!invite) {
    return interaction.reply({ content: "❌ You don’t have any pending gang invites.", flags: MessageFlags.Ephemeral });
  }

  const gang = await Gang.findById(invite.gangId);
  if (!gang) {
    await invite.deleteOne();
    return interaction.reply({ content: "❌ That gang no longer exists.", flags: MessageFlags.Ephemeral });
  }

  // check capacity
  if (gang.members.length >= 10) {
    await invite.deleteOne();
    return interaction.reply({ content: "❌ That gang is full.", flags: MessageFlags.Ephemeral });
  }

  // add to gang
  gang.members.push({
    userId: interaction.user.id,
    name: interaction.user.username,
    role: invite.role,
    fake: false
  });

  await gang.save();
  await invite.deleteOne();

  return interaction.reply(`✅ You joined **${gang.name}** as a **${invite.role}**!`);
}
