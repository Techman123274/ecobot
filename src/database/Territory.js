import mongoose from "mongoose";

const territorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  income: { type: Number, required: true },          // daily payout
  respectBoost: { type: Number, required: true },

  ownerGangId: { type: mongoose.Schema.Types.ObjectId, ref: "Gang", default: null },
  claimedAt: { type: Date, default: null },

  // payouts
  lastPayoutAt: { type: Date, default: null },       // last time /gang-collect succeeded
  lastOwnerGangId: { type: mongoose.Schema.Types.ObjectId, ref: "Gang", default: null },

  // book-keeping
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

territorySchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Territory || mongoose.model("Territory", territorySchema);
