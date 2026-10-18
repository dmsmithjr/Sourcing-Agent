import "dotenv/config";
import axios from "axios";

// One-time setup: registers /add, /remove and /list in the server that owns the command channel.
// Re-run it only if the command definitions below change.
const STRING = 3;
const NUMBER = 10;
// MANAGE_GUILD: only server managers see the commands, so other members can't edit the watchlist.
const MANAGE_GUILD = String(1 << 5);

const COMMANDS = [
  {
    name: "add",
    description: "Add an item to the sourcing watchlist",
    options: [
      { type: STRING, name: "item", description: "What to search eBay for, e.g. Jordan 4 Black Cat", required: true },
      { type: NUMBER, name: "max_buy", description: "Highest price you'd pay ($)", required: true, min_value: 0 },
      { type: NUMBER, name: "resale", description: "What it usually sells for ($)", required: true, min_value: 0 },
      { type: NUMBER, name: "min_profit", description: "Only alert if net profit is at least this ($)", required: true, min_value: 0 },
    ],
  },
  {
    name: "remove",
    description: "Remove an item from the sourcing watchlist",
    options: [
      { type: STRING, name: "item", description: "Item name, or its number from /list", required: true },
    ],
  },
  { name: "list", description: "Show what the sourcing agent is searching for" },
].map((command) => ({ ...command, default_member_permissions: MANAGE_GUILD }));

const api = axios.create({
  baseURL: "https://discord.com/api/v10",
  headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
});

const { data: app } = await api.get("/applications/@me");
const { data: channel } = await api.get(`/channels/${process.env.DISCORD_COMMAND_CHANNEL_ID}`);
const { data: registered } = await api.put(
  `/applications/${app.id}/guilds/${channel.guild_id}/commands`,
  COMMANDS
);
console.log(`✅ Registered ${registered.map((c) => "/" + c.name).join(", ")} for ${app.name}`);
