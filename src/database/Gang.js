import mongoose from "mongoose";

// 🔫 Gun schema (with durability)
const gunSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "glock",
        "draco",
        "uzi",
        "ar15",
        "ak47",
        "shotgun",
        "sniper",
        "custom",
      ],
      required: true,
    },
    durability: { type: Number, default: 3 }, // decreases with use
  },
  { _id: false } // no separate ID for each gun
);

// 📦 Stash schema
const stashSchema = new mongoose.Schema(
  {
    drugs: {
      weed: { type: Number, default: 0 },
      cocaine: { type: Number, default: 0 },
      heroin: { type: Number, default: 0 },
      meth: { type: Number, default: 0 },
    },
    guns: { type: [gunSchema], default: [] }, // always an array
  },
  { _id: false }
);

// 🏴 Gang schema
const gangSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  leaderId: { type: String, required: true },
  treasury: { type: Number, default: 0 },
  respect: { type: Number, default: 0 },
  heat: { type: Number, default: 0 },

  // ✅ stash is always an object with safe defaults
  stash: { type: stashSchema, default: () => ({}) },

  members: [
    {
      userId: { type: String, default: null },
      fake: { type: Boolean, default: false },
      name: String,
      role: {
        type: String,
        enum: ["leader", "runner", "trapper", "shooter", "eco"],
        required: true,
      },
    },
  ],

  upgrades: { type: Object, default: {} },
});

export default mongoose.models.Gang || mongoose.model("Gang", gangSchema);
