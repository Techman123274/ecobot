// events/interactionCreate.js
export default async (client, interaction) => {
  // Handle slash & context menu commands
  const isSlash = typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand();
  const isCtx   = typeof interaction.isContextMenuCommand === "function" && interaction.isContextMenuCommand();
  if (!isSlash && !isCtx) return;

  const commandName = interaction.commandName;

  // ---- record activity + counters for the dashboard
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

      // pretty user label (handles discriminator "0")
      const userTag =
        interaction.user?.discriminator && interaction.user.discriminator !== "0"
          ? `${interaction.user.username}#${interaction.user.discriminator}`
          : `@${interaction.user?.username || "unknown"}`;

      // include subcommand if present
      let cmd = `/${commandName}`;
      try {
        const sub = interaction.options?.getSubcommand?.(false);
        if (sub) cmd += ` ${sub}`;
      } catch { /* no subcommand */ }

      const where = interaction.guild ? ` in ${interaction.guild.name}` : "";
      pushRecent(`Command ${cmd} by ${userTag}${where}`);
    }
  } catch {/* never block command handling */ }

  // ---- run the actual command
  const command = client.commands.get(commandName);
  if (!command) return;

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
