// Items to hunt for. Prices are in USD.
//   keyword           – eBay search query
//   maxBuyPrice       – listings above this price are filtered out by eBay
//   targetResaleValue – what you expect to sell the item for
//   minProfitMargin   – minimum net profit (after fees + shipping) to trigger an alert
export const WATCHLIST = [
  {
    keyword: "Supreme Box Logo Hoodie",
    maxBuyPrice: 250,
    targetResaleValue: 400,
    minProfitMargin: 60,
  },
  {
    keyword: "Nike Dunk Low Panda",
    maxBuyPrice: 90,
    targetResaleValue: 140,
    minProfitMargin: 20,
  },
  {
    keyword: "Arc'teryx Beta AR Jacket",
    maxBuyPrice: 300,
    targetResaleValue: 475,
    minProfitMargin: 75,
  },
];

// Profit model shared by the pre-filter and the Gemini prompt.
export const MARKETPLACE_FEE_RATE = 0.13;
export const SHIPPING_COST = 10;

// How many eBay results to pull per keyword.
export const RESULTS_PER_KEYWORD = 20;
