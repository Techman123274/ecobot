import mongoose from "mongoose";

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  maxUses: { type: Number, default: 0 }, // 0 = unlimited
  uses: { type: Number, default: 0 }, // how many times redeemed
  expires: { type: Date, default: null }, // null = no expiry
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("PromoCode", promoCodeSchema);
