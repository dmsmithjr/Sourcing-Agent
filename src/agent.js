import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { searchListings } from "./ebayClient.js";
import { loadSeen, saveSeen } from "./seenStore.js";
import { syncWatchlist } from "./discordCommands.js";
import {
  WATCHLIST,
  MARKETPLACE_FEE_RATE,
  SHIPPING_COST,
  RESULTS_PER_KEYWORD,
} from "./config.js";

// Lite model: the full Flash model's free tier only allows 20 requests a day.
const MODEL = "gemini-3.5-flash-lite";
// Pause between Gemini calls to stay under free-tier requests-per-minute limits.
const GEMINI_DELAY_MS = 7000;

class QuotaExceededError extends Error {}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function netProfit(resaleValue, buyPrice) {
  return resaleValue - buyPrice - resaleValue * MARKETPLACE_FEE_RATE - SHIPPING_COST;
}

function buildPrompt(item, listings) {
  const lines = listings
    .map(
      (l, i) =>
        `${i}. Title: ${l.title} | Price: $${l.price} ${l.currency} | Condition: ${l.condition} | ` +
        `Seller: ${l.seller} (feedback: ${l.sellerFeedback ?? "n/a"}%)`
    )
    .join("\n");

  return `You are an expert streetwear, sneaker, and outerwear reseller evaluating eBay listings.

TARGET ITEM: "${item.keyword}"
TYPICAL RESALE VALUE: $${item.targetResaleValue}

LISTINGS:
${lines}

For EACH listing, decide whether it is a genuine match for the target item. Reject it if it is a
different model/colorway, a replica/fake/"inspired" item, a kids/GS/toddler size when the target
is adult, an empty box, a bundle/lot, parts only, or otherwise not the actual item.
Also reject listings priced implausibly low for an authentic item in that condition (for example
under about 40% of the typical resale value): these are usually fakes or scams. Only accept a
cheap listing if the title gives a clear, believable reason for the price.

Respond with ONLY a JSON array containing one object per listing, in this exact shape:
[{ "index": number, "isValidMatch": boolean, "reasoning": string }]
Keep each "reasoning" to one sentence.`;
}

// One Gemini request covers every new listing for a watchlist item, so the free daily
// quota is spent per item per run rather than per listing.
async function evaluateListings(item, listings) {
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(item, listings),
      config: { responseMimeType: "application/json" },
    });
  } catch (err) {
    if (/"code":429|RESOURCE_EXHAUSTED/.test(err.message)) throw new QuotaExceededError(err.message);
    throw err;
  }

  const verdicts = new Map(JSON.parse(response.text).map((v) => [Number(v.index), v]));
  return listings.map((listing, i) => ({
    listing,
    isValidMatch: Boolean(verdicts.get(i)?.isValidMatch),
    // Profit is computed locally; it's simple arithmetic and the model shouldn't be trusted with it.
    estimatedProfit: netProfit(item.targetResaleValue, listing.price),
    reasoning: String(verdicts.get(i)?.reasoning ?? "No verdict returned"),
    hasVerdict: verdicts.has(i),
  }));
}

async function sendDiscordAlert(item, listing, verdict) {
  const embed = {
    title: listing.title.slice(0, 256),
    url: listing.url,
    color: 0x2ecc71,
    description: verdict.reasoning.slice(0, 4096),
    fields: [
      { name: "Buy Price", value: `$${listing.price.toFixed(2)}`, inline: true },
      { name: "Target Resale", value: `$${item.targetResaleValue.toFixed(2)}`, inline: true },
      { name: "Est. Net Profit", value: `$${verdict.estimatedProfit.toFixed(2)}`, inline: true },
      { name: "Condition", value: listing.condition, inline: true },
      { name: "Seller", value: `${listing.seller} (${listing.sellerFeedback ?? "n/a"}%)`, inline: true },
      { name: "Watchlist", value: item.keyword, inline: true },
    ],
    footer: { text: `Fees ${MARKETPLACE_FEE_RATE * 100}% + $${SHIPPING_COST} shipping · ${MODEL}` },
    timestamp: new Date().toISOString(),
  };
  if (listing.imageUrl) embed.thumbnail = { url: listing.imageUrl };

  const payload = { username: "Sourcing Agent", embeds: [embed] };
  // Webhooks are rate limited to a handful of posts every few seconds; wait it out and retry.
  for (let attempt = 1; ; attempt++) {
    try {
      await axios.post(process.env.DISCORD_WEBHOOK_URL, payload);
      return;
    } catch (err) {
      if (err.response?.status !== 429 || attempt >= 5) throw err;
      await sleep((Number(err.response.data?.retry_after ?? 2) + 0.25) * 1000);
    }
  }
}

async function processWatchItem(item, seen) {
  console.log(`\n🔎 ${item.keyword} (max $${item.maxBuyPrice})`);
  const listings = await searchListings(item.keyword, item.maxBuyPrice, RESULTS_PER_KEYWORD);
  console.log(`   ${listings.length} listing(s) found`);

  // Do the math locally first so Gemini quota is only spent on listings that can clear the bar.
  // Skip anything a previous run already evaluated so it never alerts twice.
  const candidates = listings.filter(
    (l) => !seen.has(l.itemId) && netProfit(item.targetResaleValue, l.price) >= item.minProfitMargin
  );
  console.log(`   ${candidates.length} new candidate(s) pass the profit pre-filter`);

  if (!candidates.length) return 0;

  const verdicts = await evaluateListings(item, candidates);
  let alerts = 0;
  for (const verdict of verdicts) {
    const { listing } = verdict;
    const label = verdict.isValidMatch ? "MATCH" : "skip ";
    console.log(`   [${label}] $${listing.price} → $${verdict.estimatedProfit.toFixed(0)} | ${listing.title}`);

    try {
      if (verdict.isValidMatch && verdict.estimatedProfit >= item.minProfitMargin) {
        await sendDiscordAlert(item, listing, verdict);
        alerts++;
      }
      // Listings the model skipped over get another look next run.
      if (verdict.hasVerdict) seen.set(listing.itemId, new Date().toISOString());
    } catch (err) {
      console.error(`   ⚠️  Alert failed for "${listing.title}": ${err.message}`);
    }
  }
  await sleep(GEMINI_DELAY_MS);
  return alerts;
}

async function main() {
  const required = ["GEMINI_API_KEY", "DISCORD_WEBHOOK_URL", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  // Discord commands are optional; without a bot configured, config.js is the watchlist.
  let watchlist = WATCHLIST;
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_COMMAND_CHANNEL_ID) {
    try {
      watchlist = await syncWatchlist(WATCHLIST);
    } catch (err) {
      const detail = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
      console.error(`⚠️  Discord commands unavailable, using config.js watchlist: ${detail}`);
    }
  }

  const seen = await loadSeen();
  let totalAlerts = 0;
  for (const item of watchlist) {
    try {
      totalAlerts += await processWatchItem(item, seen);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        // Unevaluated listings aren't marked seen, so they're retried once the quota resets.
        console.error("❌ Gemini free-tier quota used up; stopping this run early.");
        break;
      }
      const detail = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
      console.error(`❌ Watchlist item "${item.keyword}" failed: ${detail}`);
    }
  }
  await saveSeen(seen);
  console.log(`\n✅ Done. ${totalAlerts} alert(s) sent.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
