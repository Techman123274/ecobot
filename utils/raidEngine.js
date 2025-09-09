// utils/raidEngine.js
import Territory from "../src/database/Territory.js";
import Gang from "../src/database/Gang.js";
import Wallet from "../src/database/Wallet.js";

// quick RNG
const r = () => Math.random();

export async function calculateRaidOutcome(attackerGangId, defenderGangId, territoryName) {
  // super basic: compare sizes/levels if present, else coinflip
  const [atk, def] = await Promise.all([
    Gang.findOne({ gangId: attackerGangId }),
    Gang.findOne({ gangId: defenderGangId }),
  ]);

  const atkPwr = (atk?.members?.length || 3) + (atk?.level || 1);
  const defPwr = (def?.members?.length || 3) + (def?.level || 1);
  const base = atkPwr / Math.max(1, atkPwr + defPwr); // 0..1

  return {
    chanceOfSuccess: Math.min(0.9, Math.max(0.1, base)),
    expectedLoot: Math.floor(1000 + r() * 4000),
    expectedDamage: Math.floor(200 + r() * 1000),
  };
}

export async function startRaid({ guildId, attackerGangId, defenderGangId, territoryName }) {
  const terr = await Territory.findOne({ guildId, name: territoryName });
  if (!terr) {
    return { success: false, note: "Territory not found" };
  }

  const { chanceOfSuccess, expectedLoot } = await calculateRaidOutcome(attackerGangId, defenderGangId, territoryName);
  const success = r() < chanceOfSuccess;

  if (success) {
    // transfer ownership & simulate loot
    terr.ownerGangId = attackerGangId;
    await terr.save();

    // optional: add loot to attacker gang wallet/treasury if you track it
    // const atkGang = await Gang.findOne({ gangId: attackerGangId });
    // atkGang.treasury = (atkGang.treasury || 0) + expectedLoot;
    // await atkGang.save();

    return { success: true, loot: expectedLoot, newOwnerGangId: attackerGangId };
  } else {
    return { success: false, loot: 0, note: "Defenders held the territory." };
  }
}
