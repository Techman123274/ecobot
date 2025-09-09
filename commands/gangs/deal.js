import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import mongoose from "mongoose";
import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";

const drugPrices = {
  weed: [100, 200],
  cocaine: [500, 1000],
  heroin: [800, 1500],
};

export const data = new SlashCommandBuilder()
  .setName("deal")
  .setDescription("Buy drugs from a plug (risk: scam, cops, or rival gangs).")
  .addStringOption(opt =>
    opt
      .setName("type")
      .setDescription("Type of drug")
      .setRequired(true)
      .addChoices(
        { name: "Weed", value: "weed" },
        { name: "Cocaine", value: "cocaine" },
        { name: "Heroin", value: "heroin" }
      )
  )
  .addIntegerOption(opt =>
    opt
      .setName("amount")
      .setDescription("Amount to buy")
      .setRequired(true)
  );

export async function execute(interaction) {
  const type = interaction.options.getString("type");
  const rawAmount = interaction.options.getInteger("amount");

  if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
    return interaction.reply({
      content: "❌ Amount must be a positive integer.",
      flags: MessageFlags.Ephemeral,
    });
  }
  const amount = Math.min(rawAmount, 10_000);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId: interaction.user.id }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return interaction.reply({
        content: "❌ You need a wallet first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    wallet.drugs ||= { weed: 0, cocaine: 0, heroin: 0 };

    // pricing
    const [min, max] = drugPrices[type];
    const unitPrice = Math.floor(Math.random() * (max - min + 1) + min);
    const totalCost = unitPrice * amount;

    if (wallet.balance < totalCost) {
      await session.abortTransaction();
      return interaction.reply({
        content: "💸 Not enough cash.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // gang
    const gang = await Gang.findOne({ "members.userId": interaction.user.id }).session(session);
    const isTrapper = gang?.members.some(m => m.userId === interaction.user.id && m.role === "trapper");

    const rivals = await Gang.find(gang ? { _id: { $ne: gang._id } } : {}).session(session);
    const hasRivals = rivals.length > 0;

    // deduct balance
    wallet.balance -= totalCost;

    const roll = Math.random();
    let embed;

    if (roll < 0.1) {
      // Plug scam
      await wallet.save({ session });
      embed = new EmbedBuilder()
        .setTitle("😡 Plug Ran Off!")
        .setColor("DarkRed")
        .setDescription(`The plug took your 💵 $${totalCost.toLocaleString()} and vanished.`);
    } else if (roll < 0.25) {
      // Cops bust
      const fine = Math.floor(totalCost / 2);
      wallet.balance = Math.max(0, wallet.balance - fine);
      wallet.jailUntil = Date.now() + 5 * 60_000;
      wallet.warrants = (wallet.warrants || 0) + 1;
      await wallet.save({ session });

      if (gang) {
        gang.heat = (gang.heat || 0) + 2;
        await gang.save({ session });
      }

      embed = new EmbedBuilder()
        .setTitle("🚔 Cops Busted the Deal!")
        .setColor("Red")
        .setDescription(
          `The cops raided the deal! You lost 💵 $${fine.toLocaleString()} and were jailed 5 minutes.` +
            (gang ? `\n🔥 Gang heat +2 (now ${gang.heat}).` : "")
        );
    } else if (roll < 0.4 && hasRivals) {
      // Rival ambush
      const rival = rivals[Math.floor(Math.random() * rivals.length)];
      const leader = rival.members.find(m => m.role === "leader");

      wallet.hospitalUntil = Date.now() + 5 * 60_000;
      wallet.hospitalReason = "Shot in rival gang ambush";

      let gunUsed = false;
      if (gang) {
        gang.stash ||= { weed: 0, cocaine: 0, heroin: 0, guns: 0 };
        if (gang.stash.guns > 0) {
          gang.stash.guns -= 1;
          gunUsed = true;
        }
        await gang.save({ session });
      }

      await wallet.save({ session });

      embed = new EmbedBuilder()
        .setTitle("🔫 Rival Gang Ambush")
        .setColor("DarkRed")
        .setDescription(
          `**${rival.name}** (led by <@${leader?.userId || "unknown"}>) attacked!\n` +
            `You were hospitalized for 5 minutes.\n` +
            (gunUsed ? `Your gang used 1 gun.` : `No guns — you took the hit!`)
        );
    } else {
      // Success
      if (gang && isTrapper) {
        gang.stash ||= { weed: 0, cocaine: 0, heroin: 0, guns: 0 };
        gang.stash[type] = (gang.stash[type] || 0) + amount;
        if (Math.random() < 0.2) gang.heat += 1;
        await gang.save({ session });
      } else {
        wallet.drugs[type] = (wallet.drugs[type] || 0) + amount;
      }

      await wallet.save({ session });

      embed = new EmbedBuilder()
        .setTitle("💊 Drug Deal Success")
        .setColor("Green")
        .setDescription(
          `You bought **${amount} ${type}** for 💵 $${totalCost.toLocaleString()}.\n` +
            (gang && isTrapper
              ? `📦 Added to **${gang.name}** stash.`
              : `📦 Added to your stash.`) +
            `\n💰 Balance: $${wallet.balance.toLocaleString()}`
        );
    }

    await session.commitTransaction();
    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    await session.abortTransaction();
    console.error("Deal command failed:", err);
    return interaction.reply({
      content: "⚠️ Something went wrong processing your deal. Try again.",
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    session.endSession();
  }
}
