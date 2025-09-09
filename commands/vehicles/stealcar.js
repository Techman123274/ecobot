import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import Wallet from "../../src/database/Wallet.js";
import { checkRestrictions, sendToJail } from "../../utils/crimeSystem.js";

// Car pools by rarity
const cars = {
  family: ["Honda Civic", "Toyota Corolla", "Ford Focus", "Chevy Malibu", "Mazda 3", "Hyundai Elantra"],
  sports: ["Toyota Supra", "BMW M3", "Nissan Skyline", "Ford Mustang", "Chevy Camaro", "Dodge Charger"],
  super: ["Lamborghini Aventador", "Ferrari 488", "McLaren 720S", "Aston Martin DB11", "Porsche 911 Turbo"],
  legendary: ["Bugatti Chiron", "Koenigsegg Jesko", "Pagani Huayra", "LaFerrari", "McLaren P1"],
};

// Random helper
Array.prototype.random = function () {
  return this[Math.floor(Math.random() * this.length)];
};

export const data = new SlashCommandBuilder()
  .setName("stealcar")
  .setDescription("Plan and attempt a full car theft with choices.");

export async function execute(interaction) {
  const restrictions = await checkRestrictions(interaction.user.id, "stealcar");
  if (!restrictions.allowed) {
    return interaction.reply({ content: restrictions.reason, ephemeral: true });
  }
  const wallet = restrictions.wallet;

  // ------------------ STAGE 1: PICK TARGET ------------------
  const targetEmbed = new EmbedBuilder()
    .setTitle("🚗 Car Theft: Pick Your Target")
    .setColor("DarkGrey")
    .setDescription(
      "Choose the type of car to go after:\n\n" +
      "🚙 **Family Car** — easy job, low payout.\n" +
      "🚘 **Sports Car** — riskier, better payout.\n" +
      "🏎️ **Supercar** — very risky, huge payout."
    );

  const targetRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("family").setLabel("🚙 Family Car").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sports").setLabel("🚘 Sports Car").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("super").setLabel("🏎️ Supercar").setStyle(ButtonStyle.Danger)
  );

  const initialMessage = await interaction.reply({ embeds: [targetEmbed], components: [targetRow], fetchReply: true });

  const filter = (i) => i.user.id === interaction.user.id;
  let targetChoice;
  try {
    targetChoice = await initialMessage.awaitMessageComponent({ filter, time: 20_000 });
  } catch {
    return interaction.editReply({ content: "⌛ You missed your chance.", embeds: [], components: [] });
  }
  await targetChoice.deferUpdate();
  const targetType = targetChoice.customId;

  // ------------------ STAGE 2: PICK METHOD ------------------
  const methodEmbed = new EmbedBuilder()
    .setTitle("🔧 Choose Your Method")
    .setColor("DarkGrey")
    .setDescription(
      "How will you try to steal it?\n\n" +
      "🔑 **Pick Lock** — stealthy but tricky.\n" +
      "🪟 **Break Window** — fast, loud.\n" +
      "⚡ **Hotwire** — flashy, risky.\n" +
      "🛠 **Fake Tow Truck** — low risk, slower.\n" +
      "🎭 **Disguise & Keys** — bluff job, works better if clean.\n" +
      "🕵️ **Inside Man** — shady tip-off, rare jackpot."
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("picklock").setLabel("🔑 Pick Lock").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("breakwindow").setLabel("🪟 Break Window").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("hotwire").setLabel("⚡ Hotwire").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("towtruck").setLabel("🛠 Fake Tow Truck").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("disguise").setLabel("🎭 Disguise & Keys").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("insideman").setLabel("🕵️ Inside Man").setStyle(ButtonStyle.Success)
  );

  await interaction.editReply({ embeds: [methodEmbed], components: [row1, row2] });

  let methodChoice;
  try {
    methodChoice = await initialMessage.awaitMessageComponent({ filter, time: 20_000 });
  } catch {
    return interaction.editReply({ content: "⌛ You hesitated too long — opportunity lost.", embeds: [], components: [] });
  }
  await methodChoice.deferUpdate();
  const method = methodChoice.customId;

  // Odds adjusted by warrants
  const baseSuccess = 0.5;
  const warrantPenalty = Math.min(wallet.warrants * 0.05, 0.3);
  let successChance = baseSuccess - warrantPenalty;
  let success = false, policeNotice = false;

  switch (method) {
    case "picklock": success = Math.random() < successChance + 0.1; policeNotice = !success && Math.random() < 0.4; break;
    case "breakwindow": success = Math.random() < successChance; policeNotice = !success && Math.random() < 0.7; break;
    case "hotwire": success = Math.random() < successChance - 0.05; policeNotice = !success && Math.random() < 0.5; break;
    case "towtruck": success = Math.random() < successChance + 0.2; policeNotice = !success && Math.random() < 0.2; break;
    case "disguise": success = Math.random() < successChance + (wallet.warrants === 0 ? 0.2 : -0.1); policeNotice = !success && Math.random() < 0.3; break;
    case "insideman": success = Math.random() < 0.8; policeNotice = !success && Math.random() < 0.5; break;
  }

  if (!success && policeNotice) {
    // Police Pursuit Event
    const pursuitEmbed = new EmbedBuilder()
      .setTitle("🚨 Police Spotted You!")
      .setColor("Red")
      .setDescription("The cops noticed! What will you do?\n\n🏃 **Run Away**\n✋ **Surrender**");

    const pursuitRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("run").setLabel("🏃 Run").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("surrender").setLabel("✋ Surrender").setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [pursuitEmbed], components: [pursuitRow] });

    let pursuitChoice;
    try {
      pursuitChoice = await initialMessage.awaitMessageComponent({ filter, time: 15_000 });
    } catch {
      await sendToJail(wallet, 5);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🚔 Timeout").setColor("Red").setDescription("You froze and got caught. Jail 5 minutes.")], components: [] });
    }
    await pursuitChoice.deferUpdate();

    if (pursuitChoice.customId === "run") {
      const escape = Math.random() < 0.5;
      if (escape) {
        wallet.warrants += 2; await wallet.save();
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🏃 Escaped!").setColor("Orange").setDescription(`You escaped but gained **+2 warrants**. Total: ${wallet.warrants}`)], components: [] });
      } else {
        await sendToJail(wallet, 5);
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🚔 Caught!").setColor("Red").setDescription("You tried to run but got caught. Jail 5 minutes.")], components: [] });
      }
    } else {
      await sendToJail(wallet, 3);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✋ Surrendered").setColor("Grey").setDescription("You gave up and went to jail for 3 minutes.")], components: [] });
    }
  }

  if (!success) {
    wallet.warrants += 1; await wallet.save();
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("👀 Almost Caught").setColor("Yellow").setDescription(`You failed quietly. Warrants +1 (total ${wallet.warrants}).`)], components: [] });
  }

  // ------------------ STAGE 3: AFTERMATH ------------------
  const carPool = targetType === "family" ? cars.family : targetType === "sports" ? cars.sports : cars.super.concat(cars.legendary);
  const car = carPool.random();

  const aftermathEmbed = new EmbedBuilder()
    .setTitle("🚗 Success! You Got the Car")
    .setColor("Green")
    .setDescription(
      `You successfully stole a **${car}**!\n\nWhat will you do with it?\n\n` +
      "🔧 **Chop Shop** — sell immediately for quick cash.\n" +
      "📦 **Hide in Garage** — keep it for racing or selling later.\n" +
      "🚚 **Export Overseas** — arrange shipment, huge payout but risky."
    );

  const aftermathRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("chop").setLabel("🔧 Chop Shop").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("garage").setLabel("📦 Garage").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("export").setLabel("🚚 Export").setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({ embeds: [aftermathEmbed], components: [aftermathRow] });

  let aftermathChoice;
  try {
    aftermathChoice = await initialMessage.awaitMessageComponent({ filter, time: 20_000 });
  } catch {
    return interaction.editReply({ content: "⌛ You stalled too long — cops found the car.", embeds: [], components: [] });
  }
  await aftermathChoice.deferUpdate();

  if (aftermathChoice.customId === "chop") {
    const value = Math.floor(Math.random() * 5000) + 2000;
    wallet.balance += value; await wallet.save();
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🔧 Chop Shop").setColor("Red").setDescription(`You chopped the ${car} for 💵 $${value.toLocaleString()}. Balance: $${wallet.balance.toLocaleString()}`)], components: [] });
  } else if (aftermathChoice.customId === "garage") {
    wallet.cars.push(car); await wallet.save();
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("📦 Garage").setColor("Blue").setDescription(`You hid the ${car} in your garage.\nCheck with /garage later.`)], components: [] });
  } else {
    const value = Math.floor(Math.random() * 10000) + 8000;
    const caught = Math.random() < 0.3;
    if (caught) {
      await sendToJail(wallet, 5);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🚔 Export Failed").setColor("Red").setDescription(`The export sting was a setup! You lost the ${car} and went to jail for 5 minutes.`)], components: [] });
    } else {
      wallet.balance += value; await wallet.save();
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🚚 Export Success").setColor("Gold").setDescription(`You exported the ${car} overseas for 💵 $${value.toLocaleString()}! Balance: $${wallet.balance.toLocaleString()}`)], components: [] });
    }
  }
}
