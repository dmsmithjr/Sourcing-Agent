import { createPublicKey, verify } from "node:crypto";
import { runCommand } from "../../src/discordCommands.js";
import { WATCHLIST } from "../../src/config.js";

// Discord's Interactions Endpoint: receives /add, /remove and /list slash commands and replies
// instantly. Scanning still happens on the GitHub Actions cron; both share the pinned watchlist.
const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;

function isValidSignature(req, body) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;

  const key = createPublicKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      x: Buffer.from(process.env.DISCORD_PUBLIC_KEY, "hex").toString("base64url"),
    },
    format: "jwk",
  });
  return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
}

// Slash-command options become the same text the "!" commands use, so both share one parser.
function toCommandText(data) {
  const opt = Object.fromEntries((data.options ?? []).map((o) => [o.name, o.value]));
  switch (data.name) {
    case "add":
      return `!add ${opt.item} ${opt.max_buy} ${opt.resale} ${opt.min_profit}`;
    case "remove":
      return `!remove ${opt.item}`;
    default:
      return `!${data.name}`;
  }
}

export default async (req) => {
  const body = await req.text();
  // Discord rejects the endpoint unless bad signatures get a 401.
  if (!isValidSignature(req, body)) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body);
  if (interaction.type === PING) {
    return Response.json({ type: PONG });
  }
  if (interaction.type !== APPLICATION_COMMAND) {
    return new Response("unsupported interaction", { status: 400 });
  }

  let content;
  try {
    content = await runCommand(toCommandText(interaction.data), WATCHLIST);
  } catch (err) {
    console.error(err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err);
    content = "⚠️ Couldn't update the watchlist right now. Try again in a minute.";
  }
  return Response.json({ type: CHANNEL_MESSAGE, data: { content } });
};

export const config = { path: "/discord" };
