import mongoose from "mongoose";
import Territory from "./src/database/Territory.js";

// ⚠️ put your real URI here or read from .env
const MONGO_URI = process.env.MONGO_URI;

const SEEDS = [
  // Street-level turf
  { name: "The Corner Block", income: 500, respectBoost: 1 },
  { name: "Trap House", income: 800, respectBoost: 1 },
  { name: "Apartment Projects", income: 1200, respectBoost: 2 },

  // Local hustle spots
  { name: "Bodega Front", income: 1500, respectBoost: 2 },
  { name: "Liquor Store Lot", income: 2000, respectBoost: 3 },
  { name: "Gas Station Block", income: 2500, respectBoost: 3 },
  { name: "Strip Club Backroom", income: 3500, respectBoost: 4 },

  // Mid-tier operations
  { name: "Auto Shop Garage", income: 4000, respectBoost: 4 },
  { name: "Abandoned Warehouse", income: 5000, respectBoost: 5 },
  { name: "High-Rise Apartments", income: 6000, respectBoost: 6 },
  { name: "Downtown Club", income: 7000, respectBoost: 7 },

  // Big money moves
  { name: "Shipping Yard Docks", income: 10000, respectBoost: 10 },
  { name: "Construction Site", income: 12000, respectBoost: 12 },
  { name: "Casino Basement", income: 15000, respectBoost: 15 },
  { name: "Private Airstrip", income: 20000, respectBoost: 20 },
];

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    for (const t of SEEDS) {
      const res = await Territory.updateOne(
        { name: t.name },
        { $set: { income: t.income, respectBoost: t.respectBoost } },
        { upsert: true }
      );
      const action =
        res.upsertedCount ? "🆕 inserted" :
        (res.modifiedCount ? "♻️ updated" : "✔️ ok");
      console.log(`${action}: ${t.name}`);
    }

    console.log("✨ Territory seeding complete.");
    process.exit(0);
  } catch (e) {
    console.error("❌ Seed error:", e);
    process.exit(1);
  }
}

run();
