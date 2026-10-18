import axios from "axios";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

// Refresh a minute early so a token never expires mid-request.
const EXPIRY_BUFFER_MS = 60_000;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET } = process.env;
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set");
  }

  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE });

  const { data } = await axios.post(TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - EXPIRY_BUFFER_MS;
  return cachedToken;
}

/**
 * Search eBay for fixed-price listings at or below maxPrice (USD).
 * Returns a trimmed list of listing objects.
 */
export async function searchListings(keyword, maxPrice, limit = 20) {
  const token = await getAccessToken();

  const { data } = await axios.get(SEARCH_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    params: {
      q: keyword,
      limit,
      sort: "newlyListed",
      filter: `price:[..${maxPrice}],priceCurrency:USD,buyingOptions:{FIXED_PRICE}`,
    },
  });

  return (data.itemSummaries ?? []).map((item) => ({
    itemId: item.itemId,
    title: item.title,
    price: Number(item.price?.value ?? 0),
    currency: item.price?.currency ?? "USD",
    condition: item.condition ?? "Unknown",
    url: item.itemWebUrl,
    imageUrl: item.image?.imageUrl ?? null,
    seller: item.seller?.username ?? "unknown",
    sellerFeedback: item.seller?.feedbackPercentage ?? null,
  }));
}
