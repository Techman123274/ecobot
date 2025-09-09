import { SlashCommandBuilder } from "discord.js";
import Wallet from "../../src/database/Wallet.js";

const cooldowns = new Map(); // Track user cooldowns

// Jobs categorized by level requirement
const jobs = [
  // Beginner jobs (Level 1+)
  { name: "Cashier", min: 20, max: 80, xp: 5, failChance: 0.05, levelReq: 1, flavor: "bagging groceries and making change." },
  { name: "Janitor", min: 25, max: 90, xp: 5, failChance: 0.04, levelReq: 1, flavor: "cleaning up a messy hallway." },
  { name: "Busboy", min: 30, max: 100, xp: 6, failChance: 0.05, levelReq: 1, flavor: "collecting plates at a busy diner." },
  { name: "Barista", min: 40, max: 110, xp: 6, failChance: 0.05, levelReq: 1, flavor: "making endless caramel lattes." },
  { name: "Fast Food Worker", min: 30, max: 120, xp: 7, failChance: 0.08, levelReq: 1, flavor: "flipping burgers on the grill." },

  // Intermediate jobs (Level 5+)
  { name: "Mechanic", min: 80, max: 200, xp: 12, failChance: 0.1, levelReq: 5, flavor: "fixing a busted transmission." },
  { name: "Electrician", min: 90, max: 210, xp: 12, failChance: 0.08, levelReq: 5, flavor: "rewiring a sketchy outlet." },
  { name: "Plumber", min: 85, max: 220, xp: 12, failChance: 0.1, levelReq: 5, flavor: "unclogging a nightmare drain." },
  { name: "Carpenter", min: 70, max: 200, xp: 10, failChance: 0.07, levelReq: 5, flavor: "building sturdy furniture." },
  { name: "Truck Driver", min: 100, max: 240, xp: 15, failChance: 0.12, levelReq: 5, flavor: "hauling cargo across the highway." },

  // Service jobs (Level 10+)
  { name: "Pizza Delivery", min: 60, max: 160, xp: 8, failChance: 0.1, levelReq: 10, flavor: "racing through traffic with pizzas." },
  { name: "Taxi Driver", min: 80, max: 180, xp: 10, failChance: 0.08, levelReq: 10, flavor: "picking up late-night passengers." },
  { name: "Bartender", min: 70, max: 160, xp: 7, failChance: 0.07, levelReq: 10, flavor: "mixing drinks and listening to drama." },
  { name: "Waiter", min: 50, max: 150, xp: 7, failChance: 0.06, levelReq: 10, flavor: "balancing a tray of food orders." },
  { name: "Security Guard", min: 90, max: 200, xp: 10, failChance: 0.1, levelReq: 10, flavor: "patrolling a sketchy mall." },

  // Professional jobs (Level 15+)
  { name: "Streamer", min: 40, max: 300, xp: 12, failChance: 0.2, levelReq: 15, flavor: "grinding out content on Twitch." },
  { name: "Software Developer", min: 150, max: 400, xp: 20, failChance: 0.25, levelReq: 15, flavor: "debugging code until your eyes hurt." },
  { name: "Nurse", min: 120, max: 300, xp: 18, failChance: 0.15, levelReq: 15, flavor: "helping patients in the ER." },
  { name: "Teacher", min: 100, max: 250, xp: 15, failChance: 0.1, levelReq: 15, flavor: "grading endless assignments." },
  { name: "Reporter", min: 90, max: 230, xp: 14, failChance: 0.12, levelReq: 15, flavor: "chasing down a breaking story." },

  // Advanced careers (Level 25+)
  { name: "Doctor", min: 200, max: 500, xp: 30, failChance: 0.3, levelReq: 25, flavor: "performing tough surgeries." },
  { name: "Lawyer", min: 180, max: 450, xp: 25, failChance: 0.25, levelReq: 25, flavor: "defending a messy case in court." },
  { name: "Engineer", min: 150, max: 420, xp: 22, failChance: 0.2, levelReq: 25, flavor: "designing a new bridge." },
  { name: "Scientist", min: 160, max: 450, xp: 25, failChance: 0.22, levelReq: 25, flavor: "running risky experiments." },
  { name: "Architect", min: 140, max: 400, xp: 20, failChance: 0.18, levelReq: 25, flavor: "drafting blueprints for a skyscraper." },

  // Elite jobs (Level 40+)
  { name: "Investor", min: 200, max: 800, xp: 25, failChance: 0.3, levelReq: 40, flavor: "rolling the dice on the stock market." },
  { name: "Celebrity", min: 300, max: 1000, xp: 40, failChance: 0.35, levelReq: 40, flavor: "walking the red carpet." },
  { name: "Politician", min: 250, max: 900, xp: 35, failChance: 0.3, levelReq: 40, flavor: "making deals in the office." },
  { name: "CEO", min: 400, max: 1200, xp: 50, failChance: 0.4, levelReq: 40, flavor: "closing a multi-million dollar merger." },
  { name: "Astronaut", min: 500, max: 1500, xp: 60, failChance: 0.45, levelReq: 40, flavor: "launching into space on a mission." },
];

export const data = new SlashCommandBuilder()
  .setName("work")
  .setDescription("Do a random job to earn coins");

export async function execute(interaction) {
  const wallet = await Wallet.findOne({ userId: interaction.user.id });

  if (!wallet) {
    return interaction.reply({
      content: "❌ You need a wallet. Use `/create` first!",
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const now = Date.now();
  const cooldown = 30 * 60 * 1000; // 30 minutes

  if (cooldowns.has(userId) && now - cooldowns.get(userId) < cooldown) {
    const remaining = cooldown - (now - cooldowns.get(userId));
    const minutes = Math.ceil(remaining / (1000 * 60));
    return interaction.reply({
      content: `⏳ You need to rest! Try again in ${minutes} minutes.`,
      ephemeral: true,
    });
  }

  // Filter jobs by level
  const availableJobs = jobs.filter(j => wallet.level >= j.levelReq);
  if (!availableJobs.length) {
    return interaction.reply("❌ You don't meet the level requirement for any job yet. Keep grinding XP!");
  }

  const job = availableJobs[Math.floor(Math.random() * availableJobs.length)];

  // Failure chance
  if (Math.random() < job.failChance) {
    wallet.xp += Math.floor(job.xp / 2); // consolation XP
    await wallet.save();
    cooldowns.set(userId, now);
    return interaction.reply(
      `💀 You tried working as a **${job.name}**, but failed while ${job.flavor}\nYou still gained 🪙 ${Math.floor(
        job.xp / 2
      )} XP.`
    );
  }

  // Success
  const pay = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
  wallet.balance += pay;
  wallet.xp += job.xp;
  await wallet.save();

  cooldowns.set(userId, now);

  return interaction.reply(
    `👷 You worked as a **${job.name}**, ${job.flavor}\n💰 Earned **${pay} coins** + 🪙 ${job.xp} XP!`
  );
}
