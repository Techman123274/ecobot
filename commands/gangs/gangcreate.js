import { SlashCommandBuilder, MessageFlags } from "discord.js";
import mongoose from "mongoose";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-create")
  .setDescription("Create a new gang")
  .addStringOption(opt =>
    opt.setName("name")
      .setDescription("Gang name")
      .setRequired(true)
  );

export async function execute(interaction) {
  const rawName = interaction.options.getString("name");

  // ✅ sanitize + normalize
  let name = rawName.trim().replace(/\s+/g, " "); // collapse multiple spaces
  name = name.normalize("NFKC"); // prevent Unicode exploits

  if (name.length < 3 || name.length > 32) {
    return interaction.reply({
      content: "❌ Gang name must be between 3 and 32 characters.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (/[@#:`]/.test(name)) {
    return interaction.reply({
      content: "❌ Gang name cannot contain mentions, #, or formatting characters.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const leaderId = interaction.user.id;
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    // check if gang name exists (case-insensitive) or user is already in a gang
    const existingByName = await Gang.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    }).session(session);

    if (existingByName) {
      await session.abortTransaction();
      return interaction.reply({
        content: "❌ That gang name is already taken.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const existingByUser = await Gang.findOne({
      "members.userId": leaderId,
    }).session(session);

    if (existingByUser) {
      await session.abortTransaction();
      return interaction.reply({
        content: "❌ You are already in a gang.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // create gang
    const gang = new Gang({
      name,
      leaderId,
      treasury: 0,
      respect: 0,
      heat: 0,
      stash: { weed: 0, cocaine: 0, heroin: 0, guns: 0 },
      members: [
        {
          userId: leaderId,
          name: interaction.user.username,
          role: "leader",
          fake: false,
        },
      ],
    });

    await gang.save({ session });
    await session.commitTransaction();

    return interaction.reply(`🏴 Gang **${name}** created with leader <@${leaderId}>!`);
  } catch (err) {
    if (session) await session.abortTransaction();
    console.error("Gang create error:", err);

    return interaction.reply({
      content: "⚠️ Failed to create gang. Please try again later.",
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    if (session) session.endSession();
  }
}
