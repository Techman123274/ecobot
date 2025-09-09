// Tunable config for businesses & properties. Add more types anytime.
export const BUSINESS_TYPES = {
  fast_food: {
    display: "Fast Food",
    startupCost: 25000,
    baseDemandPerTick: 45,
    maintenancePerTick: 250,
    rentPerTick: 150,          // set to 0 if owner links a commercial property later
    stockCapacity: 120,
    roles: {
      manager:  { baseWage: 600, min: 1, max: 2 },
      cashier:  { baseWage: 200, min: 1, max: 4 },
      cook:     { baseWage: 220, min: 1, max: 4 },
      security: { baseWage: 250, min: 0, max: 2 },
    },
    skus: {
      burger: { name: "Burger", unitCost: 25, basePrice: 65 },
      fries:  { name: "Fries",  unitCost: 12, basePrice: 30 },
      drink:  { name: "Drink",  unitCost: 8,  basePrice: 20 },
    },
    eventWeights: { robbery: 2, celebrity: 1, inspection: 2, viral: 1 },
    upgrade: {
      price: lvl => 15000 * lvl,
      demandBoost: lvl => 0.08 * lvl,
      failureReduction: lvl => 0.015 * lvl,
    },
  },

  nightclub: {
    display: "Nightclub",
    startupCost: 60000,
    baseDemandPerTick: 30,
    maintenancePerTick: 500,
    rentPerTick: 350,
    stockCapacity: 160,
    roles: {
      manager:  { baseWage: 800, min: 1, max: 2 },
      bartender:{ baseWage: 320, min: 1, max: 6 },
      security: { baseWage: 400, min: 1, max: 4 },
      promoter: { baseWage: 300, min: 0, max: 3 },
    },
    skus: {
      cocktail: { name: "Cocktail", unitCost: 30, basePrice: 95 },
      beer:     { name: "Beer",     unitCost: 12, basePrice: 35 },
      vip:      { name: "VIP Entry",unitCost: 0,  basePrice: 250 },
    },
    eventWeights: { robbery: 3, celebrity: 3, inspection: 2, viral: 2 },
    upgrade: {
      price: lvl => 25000 * lvl,
      demandBoost: lvl => 0.12 * lvl,
      failureReduction: lvl => 0.02 * lvl,
    },
  },
};

export const PROPERTY_CATALOG = {
  land:       { baseValue: 30000,  maintenancePerTick: 50,  passivePerTick: 0 },
  house:      { baseValue: 60000,  maintenancePerTick: 120, passivePerTick: 40 },
  apartment:  { baseValue: 95000,  maintenancePerTick: 180, passivePerTick: 85 },
  commercial: { baseValue: 150000, maintenancePerTick: 260, passivePerTick: 160 },
};

export const TICK = {
  intervalMs: 10 * 60 * 1000, // 10 minutes
  demandMoraleWeight: 0.35,
  staffShortagePenalty: 0.25,
  securityRobberyMitigation: 0.5,
  quitMoraleThreshold: 0.25,
  bankruptcyDebtCap: 50000,
  eventBaseChance: 0.18,
};
