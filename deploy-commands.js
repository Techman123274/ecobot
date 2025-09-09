// scripts/deploy-commands.js
import { REST, Routes } from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "dotenv/config";

const MODE = process.argv.includes("--global") ? "global" : "guild";
const CLEAR = process.argv.includes("--clear"); // optional: clears chosen scope

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // required for guild mode

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID in .env");
  process.exit(1);
}
if (MODE === "guild" && !GUILD_ID) {
  console.error("❌ GUILD_ID is required for guild registration");
  process.exit(1);
}

const commandsDir = path.join(process.cwd(), "commands");
const commands = [];

// Recursively find & import all .js command files
async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(p);
    } else if (entry.isFile() && p.endsWith(".js")) {
      try {
        // Use file URL to handle spaces in paths
        const fileUrl = pathToFileURL(p).href;
        const mod = await import(fileUrl);
        if (mod?.data?.toJSON) {
          const json = mod.data.toJSON();

          // --- Safety validations (Discord constraints) ---
          if (typeof json.name !== "string" || json.name.length > 32) {
            console.warn(`⚠️  Skipping ${json.name || p}: command name must be <= 32 chars.`);
            continue;
          }
          if (typeof json.description !== "string") json.description = "No description.";
          if (json.description.length > 100) {
            console.warn(`⚠️  Trimming description for /${json.name} to 100 chars (was ${json.description.length}).`);
            json.description = json.description.slice(0, 100);
          }

          commands.push(json);
          console.log(`➕ Loaded /${json.name}`);
        } else {
          console.warn(`⚠️  Skipping ${p}: no exported "data" (SlashCommandBuilder).`);
        }
      } catch (err) {
        console.error(`❌ Failed to import ${p}:`, err.message);
      }
    }
  }
}

await collect(commandsDir);
console.log(`🧾 Found ${commands.length} commands to register (${MODE})`);

const rest = new REST({ version: "10" }).setToken(TOKEN);

try {
  if (CLEAR) {
    if (MODE === "global") {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
      console.log("🧹 Cleared ALL GLOBAL commands.");
    } else {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
      console.log(`🧹 Cleared ALL GUILD commands for guild ${GUILD_ID}.`);
    }
    process.exit(0);
  }

  if (MODE === "global") {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Global slash commands deployed (may take up to 1 hour to appear).");
  } else {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Guild slash commands deployed to ${GUILD_ID} (instant).`);
  }
} catch (err) {
  console.error("❌ Deploy failed:", err?.response?.data || err);
  process.exit(1);
}
