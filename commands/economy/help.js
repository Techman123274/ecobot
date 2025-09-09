// commands/core/help.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
  Colors,
} from "discord.js";

// --- Catalog of your commands by category (names only) ---
// Tip: keep this in sync as you add/remove commands.
// The /help <command> lookup also tries to read from client.commands if available.
const CATALOG = {
  Economy: [
    "create","balance","deposit","pay","withdraw","work",
    "daily","leaderboard","stats","property","business",
    "achievements","redeem"
  ],
  Crime: [
    "call911","scam","rob","hit","crime",
    "jail","bail","hospital","breakout","lawyer",
    "snitch","acceptcontract","heist"
  ],
  Gambling: [
    "blackjack","coinflip","crash","dice","roulette","slots",
    "keno","plinko","mines","lottery","scratchoff","sportsbet","cockfight"
  ],
  Gangs: [
    "gangcreate","gangdeposit","gang-accept","gang-decline","gang-invite",
    "gang-kick","gang-promote","gang-info","gangrunner","gangrecruit",
    "ganghire","gang-withdraw","gang-collect","gang-stash","gang-territories",
    "gang-territory-claim","gang-upgrade","gang-war","deal","sell","gang-laylow","gangdrill"
  ],
  Vehicles: ["garage","race","stealcar","chopshop"],
  Admin: ["promo-create"],
};

// Commands that exist but aren’t in a category above will show under “Misc”
const ALL_SET = new Set(Object.values(CATALOG).flat());

// Short human blurbs if a command module doesn’t provide a description
const FALLBACK_DESC = {
  // Economy
  create: "Create your wallet profile.",
  balance: "Check your wallet and bank balances.",
  deposit: "Deposit coins into your bank.",
  pay: "Send cash to another user.",
  withdraw: "Withdraw coins from your bank.",
  work: "Perform a job to earn coins.",
  daily: "Claim your daily reward.",
  leaderboard: "Top richest players.",
  stats: "View account stats.",
  property: "Manage owned properties.",
  business: "Manage/inspect your business.",
  achievements: "View your achievements.",
  redeem: "Redeem a promo code.",
  // Crime
  call911: "Report a user with warrants; arrest/raid outcomes & payouts.",
  scam: "Attempt a quick scam for coins. Risky.",
  rob: "Try to rob another user.",
  hit: "Place or execute a contract.",
  crime: "General crime action (varies).",
  jail: "Check jail status or info.",
  bail: "Bail yourself (or someone) out.",
  hospital: "Hospital actions & status.",
  breakout: "Attempt a jail break.",
  lawyer: "Hire a lawyer to reduce time.",
  snitch: "Snitch on gangs or criminals.",
  acceptcontract: "Accept a hit contract.",
  heist: "Team up for a coordinated heist.",
  // Gambling
  blackjack: "Play blackjack against the house.",
  coinflip: "Double-or-nothing coin flip.",
  crash: "Cash out before the graph crashes.",
  dice: "High/low dice rolls.",
  roulette: "Bet on colors/numbers.",
  slots: "Classic slot machine.",
  keno: "Pick numbers and hope!",
  plinko: "Pegboard luck game.",
  mines: "Avoid the mines to profit.",
  lottery: "Buy tickets, win big (maybe).",
  scratchoff: "Scratch for a chance to win.",
  sportsbet: "Bet on simulated sports.",
  cockfight: "Risky animal duel betting.",
  // Gangs
  gangcreate: "Create a new gang.",
  "gang-accept": "Accept a gang invite.",
  "gang-decline": "Decline a gang invite.",
  "gang-invite": "Invite a user to your gang.",
  "gang-kick": "Remove a member from your gang.",
  "gang-promote": "Promote/demote a member.",
  "gang-info": "Gang profile & stats.",
  gangdeposit: "Deposit to gang treasury.",
  "gang-withdraw": "Withdraw from gang treasury.",
  gangrunner: "Send an NPC runner for supplies.",
  gangrecruit: "Recruit NPCs or players.",
  ganghire: "Hire specialists.",
  "gang-collect": "Collect passive income.",
  "gang-stash": "View/modify gang stash.",
  "gang-territories": "List territories on the map.",
  "gang-territory-claim": "Attempt to claim a territory.",
  "gang-upgrade": "Upgrade gang level/skills.",
  "gang-war": "Declare/resolve a gang war.",
  deal: "Trade items between gangs/users.",
  sell: "Sell items to shops or players.",
  "gang-laylow": "Lay low to reduce heat.",
  gangdrill: "Send NPC shooter to attack.",
  // Vehicles
  garage: "Show & manage owned vehicles.",
  race: "Race for pink slips or cash.",
  stealcar: "Attempt to steal a vehicle.",
  chopshop: "Chop a vehicle for parts.",
  // Admin
  "promo-create": "Create a promo code (admin).",
};

function formatList(names) {
  if (!names?.length) return "_No commands in this category yet._";
  return names.sort((a, b) => a.localeCompare(b)).map(n => `</${n}:0> — ${FALLBACK_DESC[n] ?? "No description."}`).join("\n");
}

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show help for the bot or a specific command.")
  .addStringOption(opt =>
    opt.setName("command")
      .setDescription("Get help for a specific command (e.g., balance, call911)")
      .setRequired(false)
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const query = interaction.options.getString("command")?.trim()?.toLowerCase();

  // 1) Specific command help
  if (query) {
    // Try to read command metadata from your runtime loader (common pattern)
    const fromClient = interaction.client?.commands?.get?.(query);
    const name = fromClient?.data?.name ?? query;
    const desc =
      fromClient?.data?.description ??
      FALLBACK_DESC[query] ??
      "No description available.";
    const category = Object.entries(CATALOG).find(([, list]) => list.includes(name))?.[0] ?? (ALL_SET.has(name) ? "Misc" : "Misc");

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`/${name}`)
      .addFields(
        { name: "Description", value: desc },
        { name: "Category", value: `\`${category}\`` }
      )
      .setFooter({ text: "Tip: Use /help without arguments to browse all categories." });

    // If the module exposed usage or options, show them
    if (fromClient?.usage) {
      embed.addFields({ name: "Usage", value: `\`${fromClient.usage}\`` });
    }
    if (fromClient?.examples?.length) {
      embed.addFields({ name: "Examples", value: fromClient.examples.map(e => `• \`${e}\``).join("\n") });
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // 2) Category browser
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help-menu:${interaction.id}`)
    .setPlaceholder("Choose a category")
    .addOptions([
      { label: "All Commands", value: "All", description: "See everything" },
      { label: "Economy", value: "Economy" },
      { label: "Crime", value: "Crime" },
      { label: "Gambling", value: "Gambling" },
      { label: "Gangs", value: "Gangs" },
      { label: "Vehicles", value: "Vehicles" },
      { label: "Admin", value: "Admin" },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  const buildEmbedFor = (cat) => {
    let desc = "";
    if (cat === "All") {
      const sections = Object.entries(CATALOG)
        .map(([k, list]) => `### ${k}\n${formatList(list)}`);
      // Find any “Misc” commands (registered but not in CATALOG) from client cache
      const fromClient = interaction.client?.commands;
      let misc = [];
      if (fromClient) {
        for (const [cmdName, cmd] of fromClient) {
          if (!ALL_SET.has(cmdName) && cmd?.data?.name) misc.push(cmdName);
        }
      }
      if (misc.length) {
        sections.push(`### Misc\n${formatList(misc)}`);
      }
      desc = sections.join("\n\n");
    } else {
      desc = formatList(CATALOG[cat] ?? []);
    }

    return new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Help")
      .setDescription(desc)
      .setFooter({ text: "Tip: Use /help command:<name> to see details for one command." });
  };

  await interaction.reply({
    embeds: [buildEmbedFor("All")],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });

  // Collector for the select menu (ephemeral collects fine)
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id && i.customId === `help-menu:${interaction.id}`,
  });

  collector.on("collect", async (i) => {
    const value = i.values?.[0] ?? "All";
    await i.update({
      embeds: [buildEmbedFor(value)],
      components: [row],
    });
  });

  collector.on("end", async () => {
    // disable the menu after timeout
    const disabled = new StringSelectMenuBuilder(menu).setDisabled(true);
    const disabledRow = new ActionRowBuilder().addComponents(disabled);
    try {
      await interaction.editReply({ components: [disabledRow] });
    } catch {}
  });
}
