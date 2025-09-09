import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";
import Territory from "../../src/database/Territory.js";
import mongoose from "mongoose";

export const data = new SlashCommandBuilder()
  .setName("gang-territory-claim")
  .setDescription("Claim an unowned territory for your gang.")
  .addStringOption(opt =>
    opt.setName("territory").setDescription("Name of the territory").setRequired(true)
  );

export async function execute(interaction) {
  const name = interaction.options.getString("territory").trim();

  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  if (!["leader", "eco"].includes(
    gang.members.find(m => m.userId === interaction.user.id)?.role
  )) {
    return interaction.reply({ content: "❌ Only the Leader or Eco can claim territories.", flags: MessageFlags.Ephemeral });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const territory = await Territory.findOne({ name }).session(session);
    if (!territory) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ No such territory exists.", flags: MessageFlags.Ephemeral });
    }

    if (territory.ownerGangId) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ That territory is already claimed.", flags: MessageFlags.Ephemeral });
    }

    // Claim costs
    const cost = 2000;
    if (gang.treasury < cost) {
      await session.abortTransaction();
      return interaction.reply({ content: `❌ Not enough treasury funds. Claiming costs 💵 $${cost}.`, flags: MessageFlags.Ephemeral });
    }

    gang.treasury -= cost;
    territory.ownerGangId = gang._id;
    territory.claimedAt = new Date();

    await gang.save({ session });
    await territory.save({ session });

    await session.commitTransaction();

    const embed = new EmbedBuilder()
      .setTitle("🏴 Territory Claimed")
      .setColor("DarkGreen")
      .setDescription(
        `**${gang.name}** has claimed **${territory.name}**!\n` +
        `📦 Daily Income: $${territory.income.toLocaleString()}\n` +
        `⭐ Respect Boost: ${territory.respectBoost}\n` +
        `💰 Treasury after claim: $${gang.treasury.toLocaleString()}`
      );

    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    await session.abortTransaction();
    console.error("Territory claim error:", err);
    return interaction.reply({
      content: "⚠️ Failed to claim territory. Try again later.",
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    session.endSession();
  }
}
