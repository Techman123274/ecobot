import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import { checkRestrictions, sendToJail } from "../../utils/crimeSystem.js";

export const data = new SlashCommandBuilder()
  .setName("rob")
  .setDescription("Attempt to rob another user for their cash.")
  .addUserOption(opt =>
    opt.setName("target")
      .setDescription("Who do you want to rob?")
      .setRequired(true)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser("target");

  // Prevent robbing yourself
  if (target.id === interaction.user.id) {
    return interaction.reply({
      content: "❌ You can’t rob yourself.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Restrictions (e.g. jail, hospital, dead)
  const restrictions = await checkRestrictions(interaction.user.id, "rob");
  if (!restrictions.allowed) {
    return interaction.reply({
      content: restrictions.reason,
      flags: MessageFlags.Ephemeral,
    });
  }
  const robberWallet = restrictions.wallet;

  // Victim wallet
  const victimWallet = await Wallet.findOne({ userId: target.id });
  if (!victimWallet) {
    return interaction.reply({
      content: "❌ That user doesn’t have a wallet.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (victimWallet.balance <= 0) {
    return interaction.reply({
      content: "💸 That user has no cash to steal!",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Robbery outcome
  const success = Math.random() < 0.5; // 50% chance
  const embed = new EmbedBuilder().setTitle("🔫 Robbery");

  if (success) {
    const stolen = Math.floor(victimWallet.balance * (Math.random() * 0.25 + 0.1)); // steal 10%–35%
    victimWallet.balance -= stolen;
    robberWallet.balance += stolen;

    await victimWallet.save();
    await robberWallet.save();

    embed
      .setColor("Green")
      .setDescription(
        `${interaction.user} successfully robbed ${target}!\n` +
        `💰 Stolen: **$${stolen.toLocaleString()}**`
      );

    return interaction.reply({ embeds: [embed] });
  } else {
    // Failure → jail
    await sendToJail(robberWallet, 5);
    embed
      .setColor("Red")
      .setDescription(
        `🚔 ${interaction.user} tried to rob ${target} but got caught!\n` +
        `You were sent to jail for 5 minutes.`
      );

    return interaction.reply({ embeds: [embed] });
  }
}
