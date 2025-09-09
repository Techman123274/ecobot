// utils/heistManager.js
import Wallet from "../src/database/Wallet.js";
import { sendToJail, sendToHospital } from "./crimeSystem.js";

/**
 * In-memory heist store per guild.
 * You can swap to Mongo later if you want persistence across restarts.
 */
const HEISTS = new Map();

// Locations with base payouts and risk profile
export const HEIST_LOCATIONS = [
  { key: "bank", name: "🏦 Bank", min: 1800, max: 4200, baseSuccess: 0.45 },
  { key: "casino", name: "🎰 Casino", min: 2600, max: 6500, baseSuccess: 0.35 },
  { key: "museum", name: "🏛️ Museum", min: 2000, max: 5000, baseSuccess: 0.40 },
  { key: "truck", name: "🚚 Armored Truck", min: 1200, max: 3000, baseSuccess: 0.50 },
  { key: "jewelry", name: "💍 Jewelry Store", min: 1600, max: 3800, baseSuccess: 0.46 },
  { key: "lab", name: "🧪 Underground Lab", min: 3000, max: 7800, baseSuccess: 0.30 }
];

// Unique roles allowed in a heist
export const HEIST_ROLES = [
  { key: "leader", name: "Leader 🧠" },
  { key: "driver", name: "Driver 🚗" },
  { key: "hacker", name: "Hacker 💻" },
  { key: "muscle", name: "Muscle 💪" },
  { key: "lookout", name: "Lookout 👀" },
];

// Gear catalog (bought in /heist prep buy)
export const GEAR = [
  { key: "mask", name: "Mask 🎭", effect: { warrantsDown: 1 } },
  { key: "drill", name: "Thermal Drill 🔥", effect: { hackerBoost: 0.15 } },
  { key: "jammer", name: "Signal Jammer 📡", effect: { alarmDelay: 0.1 } },
  { key: "armor", name: "Kevlar Armor 🛡️", effect: { injuryDown: 0.15 } },
  { key: "fastcar", name: "Tuned Getaway Car 🏎️", effect: { driverBoost: 0.2 } },
  { key: "blueprints", name: "Blueprints 📜", effect: { baseBoost: 0.05 } },
];

export function getHeist(guildId) {
  return HEISTS.get(guildId);
}

export function ensureNoActiveHeist(guildId) {
  if (HEISTS.has(guildId)) throw new Error("A heist is already active in this server.");
}

export function createHeist({ guildId, leaderId, locationKey }) {
  const location = HEIST_LOCATIONS.find(l => l.key === locationKey);
  if (!location) throw new Error("Invalid location.");

  const heist = {
    guildId,
    leaderId,
    location,
    createdAt: Date.now(),
    phase: "lobby",
    members: {
      [leaderId]: { role: "leader", gear: new Set(), task: { status: "pending", score: 0 } }
    }
  };

  HEISTS.set(guildId, heist);
  return heist;
}

export function joinHeist(guildId, userId, roleKey) {
  const heist = HEISTS.get(guildId);
  if (!heist) throw new Error("No active heist to join.");

  if (heist.members[userId]) throw new Error("You already joined this heist.");
  if (heist.phase !== "lobby" && heist.phase !== "prep") throw new Error("Heist is already in progress.");

  // Enforce unique roles
  const taken = new Set(Object.values(heist.members).map(m => m.role));
  if (taken.has(roleKey)) throw new Error("That role is already taken.");

  // Validate role
  if (!HEIST_ROLES.some(r => r.key === roleKey)) throw new Error("Invalid role.");

  heist.members[userId] = { role: roleKey, gear: new Set(), task: { status: "pending", score: 0 } };
  return heist;
}

export function movePhase(guildId, phase) {
  const heist = HEISTS.get(guildId);
  if (!heist) throw new Error("No active heist.");
  heist.phase = phase;
  return heist;
}

export function buyGear(guildId, userId, itemKey) {
  const heist = HEISTS.get(guildId);
  if (!heist) throw new Error("No active heist.");
  if (!heist.members[userId]) throw new Error("You are not in this heist.");

  const item = GEAR.find(g => g.key === itemKey);
  if (!item) throw new Error("Invalid gear.");

  heist.members[userId].gear.add(itemKey);
  return item;
}

// ✅ Make this tolerant: return boolean, don't throw
export function setTaskResult(guildId, userId, { status, score }) {
  const heist = HEISTS.get(guildId);
  if (!heist) return false;
  if (!heist.members[userId]) return false;

  heist.members[userId].task = { status, score };
  return true;
}

export function summarizeCrew(heist) {
  const entries = Object.entries(heist.members).map(([uid, m]) => {
    const roleName = HEIST_ROLES.find(r => r.key === m.role)?.name ?? m.role;
    const gearList = [...(m.gear ?? new Set())]
      .map(k => GEAR.find(g => g.key === k)?.name ?? k)
      .join(", ") || "—";
    return `• <@${uid}> — **${roleName}** — Gear: ${gearList}`;
  });
  return entries.join("\n");
}

/**
 * Resolve outcome: calculates success chance from location base,
 * crew size, role task results, and gear. Applies payouts/punishments.
 */
export async function resolveHeist({ guildId, channelSend }) {
  const heist = HEISTS.get(guildId);
  if (!heist) throw new Error("No active heist.");

  const members = Object.entries(heist.members);
  const memberIds = members.map(([id]) => id);
  const crewSize = memberIds.length;

  // Base success
  let successChance = heist.location.baseSuccess;

  // Crew bonus (diminishing)
  successChance += Math.min(0.25, (crewSize - 1) * 0.06);

  // Role performance & gear
  let payoutMultiplier = 1.0;
  let jailRisk = 0.15;
  let deathRisk = 0.05;
  let warrantGain = 1;

  for (const [, m] of members) {
    const score = m.task?.score ?? 0;
    const status = m.task?.status ?? "pending";
    const gear = m.gear ?? new Set();

    // Gear effects
    if (gear.has("drill") && m.role === "hacker") successChance += 0.08;
    if (gear.has("jammer") && m.role === "hacker") successChance += 0.05;
    if (gear.has("armor") && m.role === "muscle") deathRisk = Math.max(0, deathRisk - 0.08);
    if (gear.has("fastcar") && m.role === "driver") successChance += 0.10;
    if (gear.has("blueprints")) successChance += 0.03;
    if (gear.has("mask")) warrantGain = Math.max(0, warrantGain - 0.4);

    // Role task influence
    switch (m.role) {
      case "leader":
        if (status === "success") {
          if (score > 0) { payoutMultiplier += 0.15; successChance -= 0.05; warrantGain += 0.5; }
          if (score < 0) { successChance += 0.06; payoutMultiplier -= 0.05; }
        }
        break;
      case "driver":
        if (status === "success") successChance += 0.10; else successChance -= 0.10;
        break;
      case "hacker":
        if (status === "success") { successChance += 0.12; payoutMultiplier += 0.10; } else successChance -= 0.12;
        break;
      case "muscle":
        if (status === "success") { successChance += 0.05; jailRisk -= 0.05; } else { deathRisk += 0.06; }
        break;
      case "lookout":
        if (status === "success") { successChance += 0.07; jailRisk -= 0.06; } else { jailRisk += 0.06; }
        break;
    }
  }

  // Clamp
  successChance = Math.max(0.05, Math.min(0.90, successChance));
  jailRisk = Math.max(0, Math.min(0.5, jailRisk));
  deathRisk = Math.max(0, Math.min(0.25, deathRisk));
  payoutMultiplier = Math.max(0.5, Math.min(1.75, payoutMultiplier));

  // Base payout
  const base = randInt(heist.location.min, heist.location.max);
  const payout = Math.floor(base * payoutMultiplier);

  const roll = Math.random();

  // Build one outcome, send, then delete heist (single place)
  let outcome;

  // Clean Success
  if (roll < successChance * 0.6) {
    await payCrew(memberIds, payout);
    await heat(memberIds, Math.max(0, Math.round(warrantGain)));
    outcome = {
      title: "💎 Heist: Clean Getaway!",
      color: 0x33cc66,
      desc: `${heist.location.name} job went smooth.\nEach member earned **${Math.floor(payout / crewSize)}** coins. Minimal heat on the crew.`,
    };
  }
  // Messy Success
  else if (roll < successChance * 0.9) {
    const unlucky = pick(memberIds);
    await payCrew(memberIds.filter(id => id !== unlucky), Math.floor(payout * 0.6));
    await heat(memberIds, Math.max(1, Math.round(warrantGain + 0.5)));
    await jailUser(unlucky, randInt(6, 12));
    outcome = {
      title: "⚖️ Heist: Messy Escape",
      color: 0xffc107,
      desc: `The crew barely escaped **${heist.location.name}**.\nEveryone (except <@${unlucky}>) got coins.\n<@${unlucky}> got grabbed and is serving time.`,
    };
  }
  // Ambush
  else if (roll < successChance + deathRisk) {
    const victim = pick(memberIds);
    await heat(memberIds, Math.max(1, Math.round(warrantGain + 1)));
    await hospitalizeUser(victim, randInt(12, 18));
    outcome = {
      title: "☠️ Heist: Ambushed",
      color: 0xe74c3c,
      desc: `Cops sprung a trap at **${heist.location.name}** — the crew scattered empty-handed.\n<@${victim}> was badly hurt and is recovering in the hospital.`,
    };
  }
  // Total Bust
  else {
    await heat(memberIds, Math.max(2, Math.round(warrantGain + 1)));
    for (const id of memberIds) await jailUser(id, randInt(8, 15));
    outcome = {
      title: "🚔 Heist: Total Bust",
      color: 0xc0392b,
      desc: `The **${heist.location.name}** job failed spectacularly. The crew was rounded up and booked.`,
    };
  }

  // Send result then clean up once
  await channelSend(outcome);
  HEISTS.delete(guildId);
  return;

  // Helpers
  async function payCrew(ids, total) {
    const each = Math.max(1, Math.floor(total / ids.length));
    for (const id of ids) {
      const w = await Wallet.findOne({ userId: id });
      if (!w) continue;
      w.balance += each;
      w.xp = (w.xp || 0) + Math.max(5, Math.floor(each / 150));
      await w.save();
    }
  }

  async function heat(ids, warrants) {
    for (const id of ids) {
      const w = await Wallet.findOne({ userId: id });
      if (!w) continue;
      w.warrants = Math.max(0, (w.warrants || 0) + warrants);
      await w.save();
    }
  }

  async function jailUser(userId, minutes) {
    const w = await Wallet.findOne({ userId });
    if (!w) return;
    await sendToJail(w, minutes);
  }

  async function hospitalizeUser(userId, minutes) {
    const w = await Wallet.findOne({ userId });
    if (!w) return;
    await sendToHospital(w, minutes, "Heist Ambush");
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

// Top-level export — now importable elsewhere
export function deleteHeist(guildId) {
  return HEISTS.delete(guildId);
}
