import mongoose from "mongoose";

const EmployeeSchema = new mongoose.Schema({
  _id: false,
  empId: { type: String, required: true },
  role:  { type: String, required: true },
  wage:  { type: Number, required: true },
  morale:{ type: Number, default: 0.7 },  // 0..1
  performance:{ type: Number, default: 0.7 }, // 0..1
});

const InventorySchema = new mongoose.Schema({
  _id: false,
  sku: { type: String, required: true },
  name:{ type: String, required: true },
  qty: { type: Number, default: 0 },
  unitCost: { type: Number, required: true },
  sellPrice:{ type: Number, required: true },
});

const EventLogSchema = new mongoose.Schema({
  _id: false,
  ts:   { type: Date, default: Date.now },
  type: { type: String },
  note: { type: String },
  delta:{ type: Number, default: 0 },
});

const BusinessSchema = new mongoose.Schema({
  guildId: { type: String, index: true },
  ownerId: { type: String, index: true },
  type:    { type: String, required: true }, // key of BUSINESS_TYPES
  name:    { type: String, required: true },
  level:   { type: Number, default: 1 },
  treasury:{ type: Number, default: 0 },
  debt:    { type: Number, default: 0 },
  reputation:{ type: Number, default: 0.5 }, // 0..1
  employees: [EmployeeSchema],
  inventory: [InventorySchema],
  lastTickAt: { type: Date, default: null },
  isBankrupt: { type: Boolean, default: false },
  history: [EventLogSchema],
}, { timestamps: true });

export default mongoose.model("Business", BusinessSchema);
