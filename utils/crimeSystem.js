import Wallet from "../src/database/Wallet.js";

/**
 * Restricts commands based on jail/death/hospital status.
 * Allowed commands: jail, bail, hospital status, hospital pay.
 */
export async function checkRestrictions(userId, commandName = "") {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return { allowed: false, reason: "❌ You need a wallet. Use `/create` first!" };

  const now = Date.now();

  // Jail check
  if (wallet.jailUntil && wallet.jailUntil > now) {
    if (!["jail", "bail"].includes(commandName)) {
      const remaining = Math.ceil((wallet.jailUntil - now) / 60000);
      return { allowed: false, reason: `🚔 You’re in jail for another **${remaining}m**. Use /jail or /bail.`, wallet };
    }
  }

  // Hospital check
  if (wallet.hospitalUntil && wallet.hospitalUntil > now) {
    if (!(commandName.startsWith("hospital"))) {
      const remaining = Math.ceil((wallet.hospitalUntil - now) / 60000);
      return { allowed: false, reason: `🏥 You’re hospitalized for **${remaining}m**. Use /hospital status or /hospital pay.`, wallet };
    }
  }

  // Dead check (optional)
  if (wallet.isDead && wallet.isDead === true) {
    return { allowed: false, reason: "💀 You’re dead. Wait for revival or use /hospital pay if available.", wallet };
  }

  return { allowed: true, wallet };
}

/**
 * Simple cooldown system (per command, in minutes).
 */
export function checkCooldown(wallet, commandName, minutes) {
  const now = Date.now();
  if (!wallet.cooldowns) wallet.cooldowns = {};

  const last = wallet.cooldowns[commandName] || 0;
  const cooldownMs = minutes * 60 * 1000;

  if (now - last < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - last)) / 60000);
    return { ready: false, message: `⏳ You must wait **${remaining}m** before using \`/${commandName}\` again.` };
  }

  wallet.cooldowns[commandName] = now;
  wallet.markModified("cooldowns"); // required for Mongoose Map/obj
  wallet.save();
  return { ready: true };
}

/**
 * Jail utility: sends to jail for N minutes
 */
export async function sendToJail(wallet, minutes = 5) {
  wallet.jailUntil = Date.now() + minutes * 60 * 1000;
  wallet.warrants = (wallet.warrants || 0) + 1;
  wallet.snitched = false; // reset snitch on new jail sentence
  await wallet.save();
  return `🚔 You were arrested and jailed for **${minutes} minutes**.`;
}

/**
 * Hospital utility: sends to hospital for N minutes
 */
export async function sendToHospital(wallet, minutes = 5, reason = "Injured") {
  wallet.hospitalUntil = Date.now() + minutes * 60 * 1000;
  wallet.hospitalReason = reason;
  await wallet.save();
  return `🏥 You were hospitalized for **${minutes} minutes**. Reason: ${reason}.`;
}
