// Items to hunt for. Prices are in USD.
//   keyword           – eBay search query
//   maxBuyPrice       – max total cost (price + seller shipping) you will pay
//   targetResaleValue – what you expect to sell the item for, or "auto" to estimate it from
//                       current eBay listings each run (separately for new and used)
//   usedResaleValue   – optional: resale value for pre-owned listings, a number or "auto".
//                       Leave it out and used listings get the same value as new ones.
//   minProfitMargin   – minimum net profit (after fees + shipping) to trigger an alert
export const WATCHLIST = [
  {
    keyword: "Supreme Box Logo Hoodie",
    maxBuyPrice: 250,
    targetResaleValue: "auto",
    minProfitMargin: 60,
  },
  {
    keyword: "Nike Dunk Low Panda",
    maxBuyPrice: 90,
    targetResaleValue: "auto",
    minProfitMargin: 20,
  },
  {
    keyword: "Arc'teryx Beta AR Jacket",
    maxBuyPrice: 300,
    targetResaleValue: "auto",
    minProfitMargin: 75,
  },
];

// Profit model shared by the pre-filter and the Gemini prompt.
export const MARKETPLACE_FEE_RATE = 0.13;
export const SHIPPING_COST = 10;

// Your delivery ZIP code. eBay needs it to quote calculated shipping; without it many
// listings come back with no shipping price at all.
export const SHIP_TO_ZIP = "30062";

// How many eBay results to pull per keyword.
export const RESULTS_PER_KEYWORD = 20;
