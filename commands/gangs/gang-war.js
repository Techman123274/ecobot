import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";

export const data = new SlashCommandBuilder()
  .setName("gang-war")
  .setDescription("Attack another gang.")
  .addUserOption(opt =>
    opt.setName("target")
      .setDescription("Target gang leader/member")
      .setRequired(true)
  );

function calcPower(gang) {
  let power = 0;

  for (const m of gang.members) {
    power += m.fake ? 5 : 10; // NPCs weaker
  }

  for (const g of gang.stash.guns) {
    power += 10 * g.durability; // durability matters
  }

  power *= 1 + gang.respect / 1000; // respect scaling
  const variance = 0.9 + Math.random() * 0.2; // ±10%
  return Math.floor(power * variance);
}

export async function execute(interaction) {
  const user = interaction.user;
  const targetUser = interaction.options.getUser("target");

  const attackerGang = await Gang.findOne({ "members.userId": user.id });
  const defenderGang = await Gang.findOne({ "members.userId": targetUser.id });

  if (!attackerGang || !defenderGang) {
    return interaction.reply({ content: "❌ Both players must be in gangs.", flags: MessageFlags.Ephemeral });
  }

  if (attackerGang.id === defenderGang.id) {
    return interaction.reply({ content: "❌ You can’t attack your own gang.", flags: MessageFlags.Ephemeral });
  }

  const atkPower = calcPower(attackerGang);
  const defPower = calcPower(defenderGang);

  let winner, loser;
  if (atkPower > defPower) {
    winner = attackerGang;
    loser = defenderGang;
  } else {
    winner = defenderGang;
    loser = attackerGang;
  }

  // Transfer 20% treasury
  const stolenCash = Math.floor(loser.treasury * 0.2);
  loser.treasury -= stolenCash;
  winner.treasury += stolenCash;

  // Transfer 20% drugs
  const drugTypes = ["weed", "cocaine", "heroin", "meth"];
  const stolenDrugs = {};
  for (const drug of drugTypes) {
    const qty = Math.floor((loser.stash.drugs[drug] || 0) * 0.2);
    loser.stash.drugs[drug] -= qty;
    winner.stash.drugs[drug] += qty;
    stolenDrugs[drug] = qty;
  }

  // Loser heat penalty
  loser.heat += 5;

  // Guns lose 1 durability
  for (const gun of winner.stash.guns) {
    gun.durability = Math.max(0, gun.durability - 1);
  }
  winner.stash.guns = winner.stash.guns.filter(g => g.durability > 0);

  await loser.save();
  await winner.save();

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Gang War")
    .setColor(winner.id === attackerGang.id ? "Green" : "Red")
    .setDescription(
      `**${attackerGang.name}** (${atkPower} power) vs **${defenderGang.name}** (${defPower} power)\n\n` +
      `🏆 Winner: **${winner.name}**\n\n` +
      `💰 Stolen Treasury: $${stolenCash.toLocaleString()}\n` +
      `🌿 Weed: ${stolenDrugs.weed}\n❄️ Cocaine: ${stolenDrugs.cocaine}\n💉 Heroin: ${stolenDrugs.heroin}\n⚗️ Meth: ${stolenDrugs.meth}\n\n` +
      `🔥 Loser Heat: +5`
    );

  return interaction.reply({ embeds: [embed] });
}
