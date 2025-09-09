import { SlashCommandBuilder, MessageFlags } from "discord.js";
import GangInvite from "../../src/database/GangInvite.js";

export const data = new SlashCommandBuilder()
  .setName("gang-decline")
  .setDescription("Decline a gang invite");

export async function execute(interaction) {
  const invite = await GangInvite.findOne({ userId: interaction.user.id });
  if (!invite) {
    return interaction.reply({ content: "❌ You don’t have any pending gang invites.", flags: MessageFlags.Ephemeral });
  }

  await invite.deleteOne();
  return interaction.reply("❌ You declined the gang invite.");
}
