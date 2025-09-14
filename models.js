// models.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, unique: true },
    username: String,
    discriminator: String,
    globalName: String,
    avatar: String,
    firstSeen: Date,
    lastSeen: Date,
    commandsRun: { type: Number, default: 0 },
    guildIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

const CommandLogSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    guildId: String,
    guildName: String,
    command: String,
    subcommand: String,
    success: Boolean,
    error: String,
  },
  { timestamps: true }
);

export const UserModel =
  mongoose.models.User || mongoose.model("User", UserSchema);
export const CommandLogModel =
  mongoose.models.CommandLog || mongoose.model("CommandLog", CommandLogSchema);
