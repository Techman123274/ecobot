// commands/admin/addcash.js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import { ensureSafeInt, clamp, isAllowed, ok, logAction, WALLET_DEFAULTS } from "../../utils/adminHelpers.js";

const MAX_ABS_DELTA = Number(process.env.ADMIN_MAX_ABS_DELTA ?? 1_000_000);

// Clone defaults but exclude balance (to avoid conflict with $inc)
const SAFE_WALLET_DEFAULTS = { ...WALLET_DEFAULTS };
delete SAFE_WALLET_DEFAULTS.balance;

export const data = new SlashCommandBuilder()
  .setName("addcash")
  .setDescription("Admin: Add balance to a user's wallet.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
  .addIntegerOption(o =>
    o.setName("amount")
      .setDescription(`Amount (1..${MAX_ABS_DELTA})`)
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(MAX_ABS_DELTA)
  )
  .addStringOption(o =>
    o.setName("reason")
      .setDescription("Reason for this balance adjustment (optional)")
      .setRequired(false)
  );

export async function execute(interaction) {
  if (!isAllowed(interaction)) {
    return interaction.reply({ content: "❌ Admins only.", flags: 64 });
  }

  try {
    const user = interaction.options.getUser("user", true);
    let amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") || "No reason provided";

    ensureSafeInt(amount);
    amount = clamp(amount, 1, MAX_ABS_DELTA);

    // Get old balance
    const before = await Wallet.findOne({ userId: user.id }).lean();

    // Update safely (no balance in $setOnInsert)
    const after = await Wallet.findOneAndUpdate(
      { userId: user.id },
      { $setOnInsert: { userId: user.id, ...SAFE_WALLET_DEFAULTS }, $inc: { balance: amount } },
      { upsert: true, new: true }
    );

    // Log action
    await logAction(
      interaction,
      "addcash",
      `+${amount} to ${user.id}\nBefore: $${before?.balance ?? 0} → After: $${after.balance}\nReason: ${reason}`
    );

    // Reply
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("💰 Balance Updated")
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})`, inline: false },
        { name: "Amount Added", value: `$${amount.toLocaleString()}`, inline: true },
        { name: "Before", value: `$${before?.balance ?? 0}`, inline: true },
        { name: "After", value: `$${after.balance}`, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setFooter({ text: `Action by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    console.error("[/addcash] error:", err);
    return interaction.reply({
      content: `❌ Something went wrong while adding cash: \`${err.message}\``,
      flags: 64,
    });
  }
}
