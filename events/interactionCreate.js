// events/interactionCreate.js
export default async (client, interaction) => {
  // Only handle slash commands (modern check)
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // ---- record the command + user for the dashboard
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

      // pretty user label (handles new username system)
      const userTag =
        interaction.user.discriminator && interaction.user.discriminator !== "0"
          ? `${interaction.user.username}#${interaction.user.discriminator}`
          : `@${interaction.user.username}`;

      // include subcommand if present
      let cmd = `/${interaction.commandName}`;
      try {
        const sub = interaction.options?.getSubcommand?.(false);
        if (sub) cmd += ` ${sub}`;
      } catch (_) {
        /* no subcommand — ignore */
      }

      const where = interaction.guild ? ` in ${interaction.guild.name}` : "";
      pushRecent(`Command ${cmd} by ${userTag}${where}`);
    }
  } catch {
    // metrics are best-effort; never block command execution
  }

  // ---- run the actual command
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
