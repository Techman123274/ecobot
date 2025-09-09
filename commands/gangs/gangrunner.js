import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import Gang from "../../src/database/Gang.js";
// Optional: if you added the raid engine helper I shared
import { startRaid, calculateRaidOutcome } from "../../utils/raidEngine.js";
const storePrices = {
  guns: 2000,   // per gun
  ammo: 200,    // per pack
  weed: 100,    // per unit
};

// If you want random gun types when buying guns:
const GUN_TYPES = ["glock", "draco", "uzi", "ar15", "ak47", "shotgun", "sniper", "custom"];
const pickGunType = () => GUN_TYPES[Math.floor(Math.random() * GUN_TYPES.length)];

export const data = new SlashCommandBuilder()
  .setName("gang-runner")
  .setDescription("Send your NPC Runner to pick up supplies.")
  .addStringOption(opt =>
    opt.setName("item")
      .setDescription("What should the runner get?")
      .setRequired(true)
      .addChoices(
        { name: "🔫 Guns", value: "guns" },
        { name: "💥 Ammo", value: "ammo" },
        { name: "🌿 Weed", value: "weed" }
      )
  )
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("How many units?")
      .setRequired(true)
  );

export async function execute(interaction) {
  const item = interaction.options.getString("item");
  const amount = interaction.options.getInteger("amount");

  // basic validation
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
    return interaction.reply({
      content: "❌ Amount must be between **1** and **1000**.",
      flags: MessageFlags.Ephemeral
    });
  }

  const gang = await Gang.findOne({ "members.userId": interaction.user.id });
  if (!gang) {
    return interaction.reply({ content: "❌ You are not in a gang.", flags: MessageFlags.Ephemeral });
  }

  // Ensure stash object & nested fields exist (defensive)
  gang.stash = gang.stash || {};
  gang.stash.drugs = gang.stash.drugs || { weed: 0, cocaine: 0, heroin: 0, meth: 0 };
  if (typeof gang.stash.drugs.weed !== "number") gang.stash.drugs.weed = 0;
  if (!Array.isArray(gang.stash.guns)) gang.stash.guns = [];
  if (typeof gang.stash.ammo !== "number") gang.stash.ammo = 0; // requires schema field added as noted above

  // Check for NPC runner
  const runner = gang.members.find(m => m.fake && m.role === "runner");
  if (!runner) {
    return interaction.reply({ content: "❌ Your gang doesn’t have an NPC Runner.", flags: MessageFlags.Ephemeral });
  }

  // pricing
  const pricePer = storePrices[item];
  if (!pricePer) {
    return interaction.reply({ content: "❌ Invalid item type.", flags: MessageFlags.Ephemeral });
  }
  const totalCost = pricePer * amount;
  if ((gang.treasury ?? 0) < totalCost) {
    return interaction.reply({ content: "💸 Not enough funds in gang treasury.", flags: MessageFlags.Ephemeral });
  }

  // Deduct money up front (you can move this after success if you prefer)
  gang.treasury -= totalCost;

  // Success chance scales with heat (hotter = riskier)
  const baseSuccess = 0.8; // 80%
  const heatPenalty = Math.min(0.4, (gang.heat || 0) * 0.01); // up to -40% at heat 40+
  const success = Math.random() < (baseSuccess - heatPenalty);

  let embed;
  let extraNote = "";

  if (success) {
    if (item === "guns") {
      for (let i = 0; i < amount; i++) {
        gang.stash.guns.push({ type: pickGunType() }); // durability defaults to 3 via schema
      }
    } else if (item === "weed") {
      gang.stash.drugs.weed += amount;
    } else if (item === "ammo") {
      gang.stash.ammo += amount; // requires ammo in schema
    }

    await gang.save();

    embed = new EmbedBuilder()
      .setTitle("🚚 Runner Returned")
      .setColor("Green")
      .setDescription(
        `Your runner **${runner.name}** picked up **${amount} ${item}**.\n\n` +
        `💰 Treasury: $${gang.treasury.toLocaleString()}`
      );
  } else {
    // failure: lose heat + maybe trigger raid later
    gang.heat += 3;
    await gang.save();

    embed = new EmbedBuilder()
      .setTitle("🚔 Runner Failed")
      .setColor("Red")
      .setDescription(
        `Your runner **${runner.name}** got caught while fetching **${amount} ${item}**.\n\n` +
        `🚨 Gang heat +3 (now ${gang.heat})\n💸 Money lost: $${totalCost.toLocaleString()}`
      );
  }

  // Optional: police raid hook (more likely on failure)
  try {
    if (typeof maybeTriggerRaid === "function") {
      const raid = await maybeTriggerRaid(gang, { baseChance: success ? 0.05 : 0.25 });
      if (raid?.happened) {
        extraNote += `\n\n${raid.summary}`;
      }
    }
  } catch {
    // ignore raid hook errors to not block command
  }

  if (extraNote) {
    embed.setDescription(`${embed.data.description}${extraNote}`);
  }

  return interaction.reply({ embeds: [embed] });
}
