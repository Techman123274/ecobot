import Wallet from "../src/database/Wallet.js";
import Business from "../src/database/Business.js";
import { BUSINESS_TYPES } from "../config/economy.js";
export async function getOrCreateWallet(userId) {
  let w = await Wallet.findOne({ userId });
  if (!w) w = await Wallet.create({ userId, cash: 0, bank: 0 });
  return w;
}

export async function requireOwnerBusiness(guildId, userId) {
  const biz = await Business.findOne({ guildId, ownerId: userId, isBankrupt: { $ne: true } });
  if (!biz) throw new Error("NO_BUSINESS");
  return biz;
}

export function shortId() { return Math.random().toString(36).slice(2,7); }

export function ensureInventoryShape(biz) {
  const cfg = BUSINESS_TYPES[biz.type];
  const seen = new Set(biz.inventory.map(i=>i.sku));
  for (const [sku, sk] of Object.entries(cfg.skus)) {
    if (!seen.has(sku)) biz.inventory.push({ sku, name: sk.name, qty: 0, unitCost: sk.unitCost, sellPrice: sk.basePrice });
  }
}
