<img width="2038" height="705" alt="Sourcing_Agent_Github_70x70" src="https://github.com/user-attachments/assets/218d67c9-ae77-405e-9fc1-af40f87c3adb" />

## Sourcing Agent

A lightweight, automated deal finder for online resellers. Every 15 minutes, **Sourcing Agent** queries the eBay Browse API for items on a active watchlist, executes deterministic profit calculations, uses AI model verification via Google Gemini to filter out irrelevant or fraudulent listings, and delivers actionable alerts to a private Discord channel.

Designed to operate entirely within free-tier cloud services (**GitHub Actions**, **eBay Developer Program**, **Google AI Studio**, and **Discord Webhooks**).

---

## Key Features

* **Automated Scans:** Scheduled execution every 15 minutes via GitHub Actions.
* **Two-Tier Filtering:**
* **Deterministic Financial Filter:** Fast local math checks evaluate net margins before invoking external LLM APIs.
* **AI Authenticity & Context Check:** Google Gemini evaluates candidate titles, descriptions, and metadata to eliminate fakes, wrong sizes, accessory-only listings, empty boxes, and bulk lots.


* **Remote Watchlist Management:** Manage watchlist items remotely via Discord using standard prefix commands (`!add`, `!remove`, `!list`) or instant Slash commands (`/add`, `/remove`).
* **Stateless Persistence:** Uses a pinned Discord message for watchlist state storage and persistent key-value caching to prevent duplicate listing alerts across runs.
* **Quota-Optimized:** Batched AI requests process multiple candidate listings per keyword in a single API round-trip to minimize quota consumption.

---

## How It Works

```
GitHub Actions Runner (Cron Schedule)
 ├─► Query eBay Browse API (Active Keywords)
 ├─► Deduplication Filter (Skip recently evaluated Item IDs)
 ├─► Profit Margin Filter (Resale Value − Price − Fees − Shipping)
 ├─► Gemini AI Evaluation (Verify condition, authenticity, and item match)
 └─► Discord Webhook (Post verified alerts to target channel)

```

---

## Setup & Deployment

### 1. Prerequisites & API Credentials

To run this agent, obtain API credentials from the respective developer platforms:

| Credential | Provider / Source | Purpose |
| --- | --- | --- |
| `EBAY_CLIENT_ID` | eBay Developer Portal | OAuth application authentication |
| `EBAY_CLIENT_SECRET` | eBay Developer Portal | OAuth application authorization |
| `GEMINI_API_KEY` | Google AI Studio | Gemini API evaluation calls |
| `DISCORD_WEBHOOK_URL` | Discord Channel Integrations | Alert notification destination |
| `DISCORD_BOT_TOKEN` *(Optional)* | Discord Developer Portal | Watchlist management interface |
| `DISCORD_COMMAND_CHANNEL_ID` *(Optional)* | Discord Client | Restricted channel ID for commands |
| `DISCORD_PUBLIC_KEY` *(Optional)* | Discord Developer Portal | Interaction verification for Slash commands |

> **Security Notice:** Never commit actual API keys or tokens to public repositories. All sensitive variables must be supplied via GitHub Repository Secrets or local `.env` files (excluded via `.gitignore`).

---

### 2. Local Setup (Development)

1. Clone the repository:
```bash
git clone https://github.com/your-username/sourcing-agent.git
cd sourcing-agent

```


2. Install dependencies:
```bash
npm install

```


3. Create a local environment configuration file:
```bash
cp .env.example .env

```


4. Populate `.env` with your sandbox or production API keys and run a single test scan:
```bash
npm start

```



---

### 3. Automated GitHub Actions Deployment

1. Push your repository to GitHub.
2. In your repository, navigate to **Settings** → **Secrets and variables** → **Actions**.
3. Add each credential listed in the table above as a **Repository Secret**.
4. The workflow in `.github/workflows/sourcing_cron.yml` will automatically execute according to its defined schedule. You can manually trigger an execution run from the **Actions** tab.

---

### 4. Slash Commands Deployment (Optional)

To enable instant `/add`, `/remove`, and `/list` handling via serverless webhooks:

1. Deploy the repository to a serverless platform (e.g., Netlify).
2. Set `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, and `DISCORD_COMMAND_CHANNEL_ID` as environment variables on your platform.
3. In the Discord Developer Portal, configure the **Interactions Endpoint URL** to point to your deployed endpoint path (e.g., `https://<your-domain>/discord`).
4. Register the commands once:
```bash
npm run register-commands

```



---

## Configuration Example

Core financial constants and fallback configurations are managed in `src/config.js`.

```javascript
// src/config.js - Example Configuration Structure
module.exports = {
  // Default fallback watchlist (used if remote bot state is uninitialized)
  WATCHLIST: [
    {
      keyword: "Item Title Keyword",
      maxBuyPrice: 100,          // Maximum acceptable purchase price ($)
      targetResaleValue: 180,    // Estimated resale value ($)
      minProfitMargin: 30        // Minimum required profit after expenses ($)
    }
  ],

  // Financial Parameters
  MARKETPLACE_FEE_RATE: 0.13,    // Estimated selling fees (13%)
  SHIPPING_COST: 10.00,          // Fixed baseline shipping allowance ($)
  RESULTS_PER_KEYWORD: 20        // Maximum eBay items evaluated per keyword per run
};

```

---

## Repository Overview

```text
sourcing-agent/
├── .github/
│   └── workflows/          # GitHub Actions scheduled workflow definitions
├── netlify/
│   └── functions/          # Serverless interaction handlers for Discord
├── scripts/
│   └── registerCommands.js # Command registration utility for Discord API
├── src/
│   ├── agent.js            # Core scanner and decision orchestrator
│   ├── config.js           # Default configurations and financial parameters
│   ├── discordCommands.js  # Command processing and state persistence logic
│   ├── ebayClient.js       # eBay Browse API integration client
│   ├── gemini.js           # Gemini API client and prompt templates
│   └── seenStore.js        # Deduplication cache handler
├── .env.example            # Environment template file
└── README.md

```

---

## Security Best Practices

* **Secrets Isolation:** No credentials, channel IDs, or authentication tokens are hardcoded within the source code.
* **Webhook Privacy:** Do not expose your `DISCORD_WEBHOOK_URL`. Anyone with access to the URL can post messages to your channel.
* **Scoped Permissions:** Ensure your Discord Bot Token uses minimal required permissions (Send Messages, Read Message History).

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
