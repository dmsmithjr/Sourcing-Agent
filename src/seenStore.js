import { readFile, writeFile } from "node:fs/promises";

// Listings already sent to Gemini, keyed by eBay itemId → ISO timestamp.
// Persisted between GitHub Actions runs via actions/cache.
const SEEN_FILE = new URL("../seen.json", import.meta.url);
// Forget listings after a week so the file stays small.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function loadSeen() {
  try {
    const entries = JSON.parse(await readFile(SEEN_FILE, "utf8"));
    const cutoff = Date.now() - MAX_AGE_MS;
    return new Map(Object.entries(entries).filter(([, seenAt]) => Date.parse(seenAt) >= cutoff));
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
}

export async function saveSeen(seen) {
  await writeFile(SEEN_FILE, JSON.stringify(Object.fromEntries(seen), null, 2));
}
