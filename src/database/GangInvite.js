import mongoose from "mongoose";

const gangInviteSchema = new mongoose.Schema({
  gangId: { type: mongoose.Schema.Types.ObjectId, ref: "Gang", required: true },
  userId: { type: String, required: true },
  role: { type: String, enum: ["runner", "trapper", "shooter", "eco"], required: true },
  invitedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: "1d" } // auto expire in 24h
});

export default mongoose.models.GangInvite || mongoose.model("GangInvite", gangInviteSchema);
