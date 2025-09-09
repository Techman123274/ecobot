import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import mongoose from "mongoose";
import Gang from "../../src/database/Gang.js";
import Wallet from "../../src/database/Wallet.js";

export const data = new SlashCommandBuilder()
  .setName("gang-drill")
  .setDescription("Send your NPC shooter to attack another user.")
  .addUserOption(opt =>
    opt.setName("target").setDescription("Target user").setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("target");
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: "❌ You cannot drill yourself.", flags: MessageFlags.Ephemeral });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const gang = await Gang.findOne({ "members.userId": interaction.user.id }).session(session);
    if (!gang) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
    }

    const shooter = gang.members.find(m => m.fake && m.role === "shooter");
    if (!shooter) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ Your gang doesn’t have an NPC shooter.", flags: MessageFlags.Ephemeral });
    }

    if (!gang.stash.guns || gang.stash.guns.length < 1) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ Your gang doesn’t have any guns to use in this drill.", flags: MessageFlags.Ephemeral });
    }

    const victim = await Wallet.findOne({ userId: target.id }).session(session);
    if (!victim) {
      await session.abortTransaction();
      return interaction.reply({ content: "❌ Target has no wallet.", flags: MessageFlags.Ephemeral });
    }

    // pick the first gun (you can randomize here if you want)
    const usedGun = gang.stash.guns[0];

    // reduce durability or remove if broken
    if (usedGun.durability > 1) {
      usedGun.durability -= 1;
    } else {
      gang.stash.guns.shift(); // remove gun
    }

    const success = Math.random() < 0.6;
    let embed;

    if (success) {
      victim.hospitalUntil = Date.now() + 5 * 60 * 1000;
      victim.hospitalReason = "Drive-by Shooting";
      gang.respect += 5;

      await victim.save({ session });
      await gang.save({ session });
      await session.commitTransaction();

      embed = new EmbedBuilder()
        .setTitle("🔫 Gang Drill Success")
        .setColor("DarkRed")
        .setDescription(
          `Your shooter **${shooter.name}** hit ${target}!\n` +
          `💥 ${target.username} hospitalized for 5 minutes.\n\n` +
          `🔫 Used: ${usedGun.type} (durability left: ${usedGun.durability || "destroyed"})\n` +
          `+5 respect gained (Total: ${gang.respect})`
        );
    } else {
      gang.heat += 5;

      // 🔥 Small chance shooter is lost
      if (Math.random() < 0.1) {
        gang.members = gang.members.filter(m => m !== shooter);
      }

      await gang.save({ session });
      await session.commitTransaction();

      embed = new EmbedBuilder()
        .setTitle("🚔 Drill Failed")
        .setColor("Grey")
        .setDescription(
          `Your shooter **${shooter.name}** failed against ${target}.\n` +
          `🚨 Police heat increased by **+5** (now ${gang.heat}).\n` +
          `🔫 Used: ${usedGun.type} (durability left: ${usedGun.durability || "destroyed"})`
        );
    }

    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    await session.abortTransaction();
    console.error("Gang drill error:", err);
    return interaction.reply({
      content: "⚠️ Drill failed due to an error. Try again later.",
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    session.endSession();
  }
}
