import mongoose from "mongoose";

const CommandToggleSchema = new mongoose.Schema(
  {
    command: { type: String, required: true, lowercase: true }, // e.g. "business"
    scope: { type: String, enum: ["global", "guild", "role", "user"], required: true },

    guildId: { type: String, default: null }, // for guild/role scopes (optional for role)
    roleId: { type: String, default: null },  // for role scope
    userId: { type: String, default: null },  // for user scope

    disabled: { type: Boolean, default: true },
    reason: { type: String, default: null },
    expiresAt: { type: Date, default: null },

    updatedBy: { type: String, default: null }, // Discord user ID of who last changed it
  },
  { timestamps: true }
);

// helpful indexes
CommandToggleSchema.index({ command: 1, scope: 1, guildId: 1, roleId: 1, userId: 1, disabled: 1 });
CommandToggleSchema.index({ expiresAt: 1 });

export default mongoose.models.CommandToggle ||
  mongoose.model("CommandToggle", CommandToggleSchema);
