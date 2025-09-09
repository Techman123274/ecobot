import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },

  // Economy
  balance: { type: Number, default: 0 },
  bank: { type: Number, default: 0 },

  // Progression
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },

  // Daily rewards
  lastDaily: { type: Date, default: null },

  // Gambling stats
  totalBets: { type: Number, default: 0 },
  totalWagered: { type: Number, default: 0 },
  totalWon: { type: Number, default: 0 },
  totalLost: { type: Number, default: 0 },

  // Streaks / Achievements
  biggestWin: { type: Number, default: 0 },
  biggestLoss: { type: Number, default: 0 },

  // Audit log
  lastGame: { type: String, default: null },

  // Crime system
  warrants: { type: Number, default: 0 },
  jailUntil: { type: Number, default: null },
  hospitalUntil: { type: Number, default: null },
  hospitalReason: { type: String, default: null },
  snitched: { type: Boolean, default: false },

  // Vehicles
  cars: { type: [String], default: [] },

  // Drugs (tiered)
  drugs: {
    weed: { type: Number, default: 0 },
    pills: { type: Number, default: 0 },     
    whippets: { type: Number, default: 0 },  
    cocaine: { type: Number, default: 0 },
    molly: { type: Number, default: 0 },     
    lean: { type: Number, default: 0 },      
    heroin: { type: Number, default: 0 },
    meth: { type: Number, default: 0 },
    lsd: { type: Number, default: 0 },
    shrooms: { type: Number, default: 0 },
    ketamine: { type: Number, default: 0 },
    ecstasy: { type: Number, default: 0 },
    designer: { type: Number, default: 0 },  
  },

  // Personal gun stash
  guns: [
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
          "custom"
        ],
        required: true,
      },
      durability: { type: Number, default: 3 }, // uses left
    },
  ],

  // Perks
  perks: {
    goldChains: { type: Number, default: 0 },
    leanCups: { type: Number, default: 0 },
    tattoos: { type: Number, default: 0 },
  },
});

export default mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
