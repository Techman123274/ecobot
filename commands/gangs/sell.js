import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import Gang from "../../src/database/Gang.js";

const sellPrices = {
  weed: [150, 300],
  cocaine: [600, 1200],
  heroin: [1000, 1800],
};

const buyers = [
  { id: "college", name: "🎓 College Kid", outcome: "success" },
  { id: "junkie", name: "💉 Desperate Junkie", outcome: "scam" },
  { id: "dealer", name: "🕶️ Shady Dealer", outcome: "successHigh" },
  { id: "cop", name: "🚔 Undercover Cop", outcome: "bust" },
  { id: "rival", name: "🔫 Rival Gang", outcome: "ambush" },
];

export const data = new SlashCommandBuilder()
  .setName("sell")
  .setDescription("Sell drugs on the street (or send a trapper).")
  .addStringOption(opt =>
    opt.setName("type").setDescription("Type of drug").setRequired(true)
      .addChoices(
        { name: "Weed", value: "weed" },
        { name: "Cocaine", value: "cocaine" },
        { name: "Heroin", value: "heroin" }
      )
  )
  .addIntegerOption(opt =>
    opt.setName("amount").setDescription("Amount to sell").setRequired(true)
  );

export async function execute(interaction) {
  const type = interaction.options.getString("type");
  const amount = interaction.options.getInteger("amount");

  const wallet = await Wallet.findOne({ userId: interaction.user.id });
  if (!wallet) return interaction.reply({ content: "❌ You need a wallet first.", flags: MessageFlags.Ephemeral });
  if (!wallet.drugs) wallet.drugs = { weed: 0, cocaine: 0, heroin: 0 };

  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  const isTrapper = gang?.members.some(m => m.userId === interaction.user.id && m.role === "trapper");

  let stashTarget = (gang && isTrapper) ? gang.stash : wallet.drugs;
  if ((stashTarget[type] || 0) < amount) {
    return interaction.reply({ content: `❌ Not enough ${type} to sell.`, flags: MessageFlags.Ephemeral });
  }

  // Prompt for seller
  const sellerEmbed = new EmbedBuilder()
    .setTitle("💊 Choose Seller")
    .setColor("DarkGreen")
    .setDescription(
      "Who will handle this drug sale?\n\n👤 **You** — interactive, high risk/reward.\n🧑‍🤝‍🧑 **NPC Trapper** — passive, ~30m delay, safer but less profit."
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("self").setLabel("👤 You Trap").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("npc").setLabel("🧑‍🤝‍🧑 Send NPC Trapper").setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [sellerEmbed], components: [row] });
  const msg = await interaction.fetchReply();

  const choice = await msg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 20_000 }).catch(() => null);
  if (!choice) return interaction.editReply({ content: "⌛ You didn’t choose.", embeds: [], components: [] });

  // Deduct stash upfront
  stashTarget[type] -= amount;
  await wallet.save();
  if (gang) await gang.save();

  if (choice.customId === "self") {
    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
    const [min, max] = sellPrices[type];
    const basePrice = Math.floor(Math.random() * (max - min) + min);
    let embed;

    switch (buyer.outcome) {
      case "success": {
        const total = basePrice * amount;
        wallet.balance += total;
        if (gang && isTrapper) gang.treasury += Math.floor(total * 0.2);
        await wallet.save();
        if (gang) await gang.save();
        embed = new EmbedBuilder().setTitle("💰 Successful Deal").setColor("Green")
          .setDescription(`You sold to ${buyer.name}.\n💵 Earned $${total.toLocaleString()}.`);
        break;
      }
      case "successHigh": {
        const total = basePrice * amount * 2;
        wallet.balance += total;
        await wallet.save();
        embed = new EmbedBuilder().setTitle("🕶️ Jackpot Buyer").setColor("Gold")
          .setDescription(`${buyer.name} paid **double**!\n💵 $${total.toLocaleString()} earned.`);
        break;
      }
      case "scam": {
        embed = new EmbedBuilder().setTitle("😡 Scammed!").setColor("DarkRed")
          .setDescription(`${buyer.name} ran off with your stash. No money earned.`);
        break;
      }
      case "bust": {
        wallet.jailUntil = Date.now() + 5 * 60 * 1000;
        wallet.warrants = (wallet.warrants || 0) + 1;
        await wallet.save();
        embed = new EmbedBuilder().setTitle("🚔 Undercover Bust").setColor("Red")
          .setDescription("That buyer was an undercover cop! You’re in jail for 5 minutes.");
        break;
      }
      case "ambush": {
        const rivals = await Gang.find(gang ? { _id: { $ne: gang._id } } : {});
        if (rivals.length > 0) {
          const rival = rivals[Math.floor(Math.random() * rivals.length)];
          const leader = rival.members.find(m => m.role === "leader");
          wallet.hospitalUntil = Date.now() + 5 * 60 * 1000;
          wallet.hospitalReason = "Shot during a drug deal ambush";
          await wallet.save();
          embed = new EmbedBuilder().setTitle("🔫 Rival Ambush").setColor("DarkRed")
            .setDescription(`**${rival.name}** (led by <@${leader?.userId || "unknown"}>) ambushed your deal!\nYou were hospitalized for 5 minutes.`);
        } else {
          embed = new EmbedBuilder().setTitle("😡 Rival Scam").setColor("DarkRed")
            .setDescription("A rival pretended to be a buyer and stole your stash.");
        }
        break;
      }
    }
    return choice.update({ embeds: [embed], components: [] });
  }

  // NPC passive mode
  if (!gang) return choice.update({ content: "❌ You need a gang with a trapper to send NPCs.", embeds: [], components: [] });

  const npc = gang.members.find(m => m.fake && m.role === "trapper");
  if (!npc) return choice.update({ content: "❌ Your gang doesn’t have an NPC Trapper.", embeds: [], components: [] });

  const success = Math.random() < 0.8;
  let embed;

  if (success) {
    const [min, max] = sellPrices[type];
    const price = Math.floor(Math.random() * (max - min) + min);
    const total = Math.floor(price * amount * 0.75);
    wallet.balance += total;
    gang.treasury += Math.floor(total * 0.3);
    await wallet.save();
    await gang.save();
    embed = new EmbedBuilder().setTitle("🧑‍🤝‍🧑 NPC Trapper Returned").setColor("Blue")
      .setDescription(`Your NPC Trapper **${npc.name}** sold the drugs.\n💵 $${total.toLocaleString()} earned.\n30% cut to gang treasury.`);
  } else {
    gang.members = gang.members.filter(m => !(m._id.equals(npc._id))); // safer removal
    await gang.save();
    embed = new EmbedBuilder().setTitle("🚔 NPC Busted").setColor("Red")
      .setDescription(`Your NPC Trapper **${npc.name}** was busted by cops and removed from your gang.`);
  }

  return choice.update({ embeds: [embed], components: [] });
}
