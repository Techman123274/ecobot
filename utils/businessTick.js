import Business from "../src/database/Business.js";
import { BUSINESS_TYPES, TICK } from "../config/economy.js";
const rand = () => Math.random();
const pickWeighted = (weights) => {
  const entries = Object.entries(weights);
  const total = entries.reduce((s,[,w])=>s+w,0);
  let r = Math.random() * total;
  for (const [k,w] of entries) { if ((r-=w) <= 0) return k; }
  return entries[0]?.[0];
};

export async function runBusinessTick(biz) {
  if (biz.isBankrupt) return { note: "bankrupt" };
  const cfg = BUSINESS_TYPES[biz.type];
  if (!cfg) return { note: "bad_config" };

  // staffing coverage
  const counts = Object.fromEntries(Object.keys(cfg.roles).map(r => [r,0]));
  for (const e of biz.employees) counts[e.role] = (counts[e.role] || 0) + 1;
  let staffedRatio = 1;
  for (const [role, info] of Object.entries(cfg.roles)) {
    const need = info.min || 0;
    if ((counts[role] || 0) < need) staffedRatio -= TICK.staffShortagePenalty;
  }
  staffedRatio = Math.max(0.2, staffedRatio);

  // morale / demand
  const moraleAvg = biz.employees.length
    ? biz.employees.reduce((s,e)=>s+e.morale,0)/biz.employees.length
    : 0.6;

  const levelBoost = cfg.upgrade.demandBoost(Math.max(0, biz.level-1));
  let demand = cfg.baseDemandPerTick * (1 + levelBoost);
  demand *= (1 + TICK.demandMoraleWeight * (moraleAvg - 0.5));
  demand *= staffedRatio;
  let customers = Math.max(0, Math.floor(demand));

  // sell from highest priced first
  const inv = biz.inventory.sort((a,b)=>b.sellPrice-a.sellPrice);
  let revenue = 0, unitsSold = 0;
  for (const item of inv) {
    if (customers <= 0) break;
    const sellable = Math.min(customers, item.qty);
    if (sellable > 0) {
      revenue += sellable * item.sellPrice;
      item.qty -= sellable;
      unitsSold += sellable;
      customers -= sellable;
    }
  }

  // expenses
  const wages = biz.employees.reduce((s,e)=>s+e.wage,0);
  const expenses = wages + cfg.maintenancePerTick + cfg.rentPerTick;

  // event
  let eventDelta = 0;
  if (rand() < TICK.eventBaseChance) {
    const evt = pickWeighted(cfg.eventWeights);
    if (evt === "robbery") {
      const hasSec = biz.employees.some(e=>e.role==="security");
      const loss = Math.floor((0.15 + rand()*0.2) * Math.max(revenue, 800));
      eventDelta -= Math.floor(hasSec ? loss * TICK.securityRobberyMitigation : loss);
      biz.history.push({ type: "robbery", note: `Robbery. Security=${hasSec?"yes":"no"}`, delta: eventDelta });
    } else if (evt === "inspection") {
      const fine = -Math.floor(300 + rand()*700);
      eventDelta += fine;
      biz.history.push({ type: "inspection", note: "Health inspection fine", delta: fine });
    } else if (evt === "celebrity") {
      const boost = Math.floor(400 + rand()*800);
      eventDelta += boost;
      biz.history.push({ type: "celebrity", note: "Celebrity visit", delta: boost });
    } else if (evt === "viral") {
      const boost = Math.floor(300 + rand()*600);
      eventDelta += boost;
      biz.history.push({ type: "viral", note: "Went viral", delta: boost });
    }
  }

  const net = revenue + eventDelta - expenses;
  biz.treasury += net;
  if (biz.treasury < 0) { biz.debt += -biz.treasury; biz.treasury = 0; }
  if (biz.debt > TICK.bankruptcyDebtCap) {
    biz.isBankrupt = true;
    biz.history.push({ type: "bankrupt", note: "Declared bankrupt", delta: 0 });
  }

  // morale drift
  const paidOK = net >= 0 || biz.treasury > 0;
  for (const e of biz.employees) {
    e.morale += paidOK ? 0.01 : -0.02;
    e.morale = Math.max(0, Math.min(1, e.morale));
    if (e.morale < TICK.quitMoraleThreshold && Math.random() < 0.12) {
      biz.history.push({ type: "quit", note: `${e.role} (${e.empId}) quit (low morale)`, delta: 0 });
      const idx = biz.employees.findIndex(x=>x.empId===e.empId);
      if (idx >= 0) biz.employees.splice(idx,1);
    }
  }

  biz.lastTickAt = new Date();
  await biz.save();
  return { revenue, wages, expenses, eventDelta, net, unitsSold };
}

// optional background loop; call from index.js after login()
let started = false;
export function startBusinessLoop() {
  if (started) return;
  started = true;
  setInterval(async () => {
    const all = await Business.find({ isBankrupt: false });
    for (const biz of all) {
      if (!biz.lastTickAt || Date.now() - new Date(biz.lastTickAt).getTime() >= 0.9 * TICK.intervalMs) {
        await runBusinessTick(biz);
      }
    }
  }, 60_000);
}
