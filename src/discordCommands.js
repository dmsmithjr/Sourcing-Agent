import axios from "axios";

// Commands are read from one Discord channel at the start of every run (the agent runs on a
// cron, not as an always-on bot). The watchlist itself lives in a message the bot pins in that
// channel, so it survives between runs without any database.
const API = "https://discord.com/api/v10";
const STATE_MARKER = "📋 **Watchlist**";
// Each item is a Gemini call per new listing, so keep the list small enough for the free tier.
const MAX_ITEMS = 10;
// Discord's message length limit, which also caps how big the pinned state can grow.
const MAX_MESSAGE_LENGTH = 2000;

const HELP_TEXT = [
  "**Sourcing Agent commands** (picked up on the next scan, within ~15 min)",
  "`!add <item name> <max buy> <resale value> <min profit>`",
  "  e.g. `!add Jordan 4 Black Cat 200 320 50`",
  "  or use `auto` as the resale value to estimate it from eBay: `!add Jordan 4 Black Cat 200 auto 50`",
  "  add `used=<value>` for a separate pre-owned resale value: `!add Jordan 4 Black Cat 200 320 50 used=250`",
  "`!remove <number or item name>` — number from `!list`",
  "`!list` — show what's being searched",
  "`!help` — show this message",
].join("\n");

function discord() {
  return axios.create({
    baseURL: API,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  });
}

function formatState(state) {
  const items = state.items.map((item) => "  " + JSON.stringify(item)).join(",\n");
  const json = `{"lastCommandId":"${state.lastCommandId}","items":[\n${items}\n]}`;
  return `${STATE_MARKER} — managed by the bot, use \`!help\` instead of editing\n\`\`\`json\n${json}\n\`\`\``;
}

function parseState(content) {
  const match = content.match(/```json\n([\s\S]*)\n```/);
  return match ? JSON.parse(match[1]) : null;
}

function formatList(items) {
  if (!items.length) return "The watchlist is empty. Add something with `!add`.";
  return items
    .map(
      (item, i) =>
        `**${i + 1}.** ${item.keyword} — buy ≤ $${item.maxBuyPrice}, ${describeResale(item)}, min profit $${item.minProfitMargin}`
    )
    .join("\n");
}

function formatResale(value) {
  return value === "auto" ? "auto" : `$${value}`;
}

function describeResale(item) {
  const resale = `resale ${formatResale(item.targetResaleValue)}`;
  return item.usedResaleValue === undefined ? resale : `${resale} (used ${formatResale(item.usedResaleValue)})`;
}

function parseResale(token) {
  return token.toLowerCase() === "auto" ? "auto" : parseMoney(token);
}

function parseMoney(token) {
  const value = Number(token.replace(/^\$/, "").replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Pinned-message endpoints moved in 2025; try the current one and fall back to the legacy path.
async function getPins(api, channelId) {
  try {
    const { data } = await api.get(`/channels/${channelId}/messages/pins`);
    return data.items.map((pin) => pin.message);
  } catch (err) {
    if (err.response?.status !== 404) throw err;
    const { data } = await api.get(`/channels/${channelId}/pins`);
    return data;
  }
}

async function pinMessage(api, channelId, messageId) {
  try {
    await api.put(`/channels/${channelId}/messages/pins/${messageId}`);
  } catch (err) {
    if (err.response?.status !== 404) throw err;
    await api.put(`/channels/${channelId}/pins/${messageId}`);
  }
}

async function loadStateMessage(api, channelId, botId, defaults) {
  const pins = await getPins(api, channelId);
  const existing = pins.find((m) => m.author.id === botId && m.content.startsWith(STATE_MARKER));
  if (existing) return { message: existing, state: parseState(existing.content) };

  // First run: seed from config.js and pin it. lastCommandId "0" means commands typed before
  // setup still get processed.
  const state = { lastCommandId: "0", items: defaults };
  const { data: message } = await api.post(`/channels/${channelId}/messages`, { content: formatState(state) });
  try {
    await pinMessage(api, channelId, message.id);
  } catch (err) {
    // An unpinned state message would never be found again, so don't leave it behind.
    await api.delete(`/channels/${channelId}/messages/${message.id}`);
    throw err;
  }
  return { message, state };
}

async function fetchNewMessages(api, channelId, afterId) {
  const { data } = await api.get(`/channels/${channelId}/messages`, {
    params: { after: afterId, limit: 100 },
  });
  // Snowflake IDs sort chronologically; compare as BigInt since they exceed Number precision.
  return data.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

// Applies one command to the item list and returns the reply text, or null if it isn't a command.
function applyCommand(items, content) {
  const [command, ...args] = content.trim().split(/\s+/);

  switch (command.toLowerCase()) {
    case "!help":
      return HELP_TEXT;

    case "!list":
      return formatList(items);

    case "!add": {
      // "used=<value>" can go anywhere; pull it out before reading the trailing numbers.
      const usedArg = args.find((a) => /^used=/i.test(a));
      if (usedArg) args.splice(args.indexOf(usedArg), 1);
      const usedResaleValue = usedArg ? parseResale(usedArg.slice("used=".length)) : undefined;
      if (usedResaleValue === null) {
        return "❌ `used=` needs a number or `auto`, e.g. `used=250`.";
      }
      if (args.length < 4) {
        return "❌ Usage: `!add <item name> <max buy> <resale value> <min profit>`\ne.g. `!add Jordan 4 Black Cat 200 320 50`";
      }
      const [maxBuyPrice, minProfitMargin] = [args.at(-3), args.at(-1)].map(parseMoney);
      const targetResaleValue = parseResale(args.at(-2));
      const keyword = args.slice(0, -3).join(" ");
      if ([maxBuyPrice, targetResaleValue, minProfitMargin].includes(null)) {
        return "❌ The last three values must be numbers: max buy, resale value (or `auto`), min profit.";
      }
      if (items.some((item) => item.keyword.toLowerCase() === keyword.toLowerCase())) {
        return `❌ **${keyword}** is already on the watchlist. \`!remove\` it first to change its prices.`;
      }
      if (items.length >= MAX_ITEMS) {
        return `❌ The watchlist is full (${MAX_ITEMS} items) to stay inside the free AI limits. \`!remove\` something first.`;
      }
      const item = { keyword, maxBuyPrice, targetResaleValue, minProfitMargin };
      if (usedResaleValue !== undefined) item.usedResaleValue = usedResaleValue;
      if (formatState({ lastCommandId: "0".repeat(20), items: [...items, item] }).length > MAX_MESSAGE_LENGTH) {
        return "❌ No room left to store another item. `!remove` something first.";
      }
      items.push(item);
      return `✅ Added **${keyword}** — buy ≤ $${maxBuyPrice}, ${describeResale(item)}, min profit $${minProfitMargin}`;
    }

    case "!remove": {
      const target = args.join(" ");
      const index = /^\d+$/.test(target)
        ? Number(target) - 1
        : items.findIndex((item) => item.keyword.toLowerCase() === target.toLowerCase());
      if (!target || index < 0 || index >= items.length) {
        return `❌ Couldn't find **${target || "?"}**. Use \`/list\` to see item numbers.`;
      }
      const [removed] = items.splice(index, 1);
      return `🗑️ Removed **${removed.keyword}**`;
    }

    default:
      return null;
  }
}

/**
 * Applies a single command (e.g. "!add Jordan 4 200 320 50") straight to the pinned watchlist and
 * returns the reply text. Used by the Netlify slash-command handler, which needs an instant answer.
 */
export async function runCommand(text, defaults) {
  const api = discord();
  const channelId = process.env.DISCORD_COMMAND_CHANNEL_ID;
  const { data: bot } = await api.get("/users/@me");

  const { message, state } = await loadStateMessage(api, channelId, bot.id, defaults);
  const before = JSON.stringify(state.items);
  const reply = applyCommand(state.items, text) ?? HELP_TEXT;
  if (JSON.stringify(state.items) !== before) {
    await api.patch(`/channels/${channelId}/messages/${message.id}`, { content: formatState(state) });
  }
  return reply;
}

/**
 * Processes any new commands in the command channel and returns the up-to-date watchlist.
 * Requires DISCORD_BOT_TOKEN and DISCORD_COMMAND_CHANNEL_ID.
 */
export async function syncWatchlist(defaults) {
  const api = discord();
  const channelId = process.env.DISCORD_COMMAND_CHANNEL_ID;
  const { data: bot } = await api.get("/users/@me");

  const { message, state } = await loadStateMessage(api, channelId, bot.id, defaults);
  const commands = (await fetchNewMessages(api, channelId, state.lastCommandId)).filter(
    (m) => !m.author.bot && m.content.trim().startsWith("!")
  );

  for (const command of commands) {
    // One message may hold several commands, one per line.
    const reply = command.content
      .split("\n")
      .filter((line) => line.trim().startsWith("!"))
      .map((line) => applyCommand(state.items, line))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_MESSAGE_LENGTH);
    if (reply) {
      console.log(`💬 ${command.author.username}: ${command.content}`);
      await api.post(`/channels/${channelId}/messages`, {
        content: reply,
        message_reference: { message_id: command.id, fail_if_not_exists: false },
      });
    }
    state.lastCommandId = command.id;
  }

  if (commands.length) {
    await api.patch(`/channels/${channelId}/messages/${message.id}`, { content: formatState(state) });
  }
  return state.items;
}
