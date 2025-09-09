import mongoose from "mongoose";
const PropertySchema = new mongoose.Schema({
  guildId: { type: String, index: true },
  ownerId: { type: String, index: true },
  type: { type: String, enum: ["land","house","apartment","commercial"], required: true },
  name: { type: String, required: true },
  baseValue: { type: Number, required: true },
  level: { type: Number, default: 1 },
  maintenancePerTick: { type: Number, default: 120 },
  passivePerTick: { type: Number, default: 0 },
}, { timestamps: true });
export default mongoose.model("Property", PropertySchema);
