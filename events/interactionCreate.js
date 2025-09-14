// events/interactionCreate.js
import { isCommandBlocked } from "../src/utils/commandGate.js";

export default async (client, interaction) => {
  // Handle slash & context menu commands
  const isSlash = typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand();
  const isCtx   = typeof interaction.isContextMenuCommand === "function" && interaction.isContextMenuCommand();
  if (!isSlash && !isCtx) return;

  const commandName = interaction.commandName;
  const command = client.commands.get(commandName);
  if (!command) return;

  // ── Dev Gate: block before counting metrics ────────────────────────────────
  try {
    const gate = await isCommandBlocked(interaction, commandName);
    if (gate?.blocked) {
      // log the block in recent activity (don’t increment counters)
      try {
        const dash = client.dashboard;
        if (dash?.pushRecent) {
          const where = interaction.guild ? ` in ${interaction.guild.name}` : "";
          const userTag =
            interaction.user?.discriminator && interaction.user.discriminator !== "0"
              ? `${interaction.user.username}#${interaction.user.discriminator}`
              : `@${interaction.user?.username || "unknown"}`;
          dash.pushRecent(`🚫 Blocked /${commandName} for ${userTag}${where}${gate.reason ? ` — ${gate.reason}` : ""}`);
        }
      } catch {}
      return interaction.reply({
        content: `🚫 This command is temporarily disabled.${gate.reason ? `\n> ${gate.reason}` : ""}`,
        ephemeral: true,
      });
    }
  } catch (e) {
    // fail-open if the gate throws, but log it
    console.error("[gate] isCommandBlocked failed:", e);
  }

  // ── Dashboard metrics + activity log ──────────────────────────────────────
  try {
    const dash = client.dashboard; // { metrics, pushRecent }
    if (dash?.metrics && dash?.pushRecent) {
      const { metrics, pushRecent } = dash;

      // counters
      metrics.commandsToday++;
      metrics.activeUsersToday.add(interaction.user.id);
      if (interaction.guildId) {
        metrics.perGuildUses.set(
          interaction.guildId,
          (metrics.perGuildUses.get(interaction.guildId) ?? 0) + 1
        );
      }

      // pretty user label
      const userTag =
        interaction.user?.discriminator && interaction.user.discriminator !== "0"
          ? `${interaction.user.username}#${interaction.user.discriminator}`
          : `@${interaction.user?.username || "unknown"}`;

      // include subcommand if present
      let cmd = `/${commandName}`;
      try {
        const sub = interaction.options?.getSubcommand?.(false);
        if (sub) cmd += ` ${sub}`;
      } catch {}

      const where = interaction.guild ? ` in ${interaction.guild.name}` : "";
      pushRecent(`Command ${cmd} by ${userTag}${where}`);
    }
  } catch {
    // never block command execution on metrics failure
  }

  // ── Execute the command ───────────────────────────────────────────────────
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const content = "❌ There was an error executing this command.";
    if (interaction.deferred || interaction.replied) {
      try { await interaction.followUp({ content, ephemeral: true }); } catch {}
    } else {
      try { await interaction.reply({ content, ephemeral: true }); } catch {}
    }
  }
};
