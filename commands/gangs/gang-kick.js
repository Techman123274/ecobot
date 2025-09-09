import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import mongoose from "mongoose";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-kick")
  .setDescription("Kick a member from your gang.")
  .addUserOption(opt =>
    opt.setName("user")
      .setDescription("User to kick")
      .setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("user");
  const leaderId = interaction.user.id;

  if (target.id === leaderId) {
    return interaction.reply({
      content: "❌ You can’t kick yourself, boss.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const gang = await Gang.findOne({ leaderId }).session(session);

    if (!gang) {
      await session.abortTransaction();
      return interaction.reply({
        content: "❌ Only gang leaders can kick members.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const memberIndex = gang.members.findIndex(m => m.userId === target.id);
    if (memberIndex === -1) {
      await session.abortTransaction();
      return interaction.reply({
        content: "❌ That user is not in your gang.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // remove member
    const removed = gang.members.splice(memberIndex, 1)[0];
    await gang.save({ session });
    await session.commitTransaction();

    const embed = new EmbedBuilder()
      .setTitle("👢 Gang Kick")
      .setColor("Red")
      .setDescription(
        `Leader <@${leaderId}> has kicked **${removed.name}** (<@${target.id}>) from **${gang.name}**.`
      );

    return interaction.reply({ embeds: [embed] });

  } catch (err) {
    console.error("Gang kick error:", err);
    await session.abortTransaction();
    return interaction.reply({
      content: "⚠️ Failed to kick member. Try again later.",
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    session.endSession();
  }
}
