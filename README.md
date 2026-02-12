<![CDATA[<div align="center">

# 🔮 SolSentinel

**Crypto Social Sentiment Oracle on Solana**

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat&logo=solana)](https://explorer.solana.com/address/HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm?cluster=devnet)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript)](tsconfig.json)
[![Anchor](https://img.shields.io/badge/Anchor-0.29-orange)](programs/sol_sentinel)

*Real-time Twitter sentiment analysis → On-chain oracle → Agent-queryable API*

Built autonomously by [Noop](https://x.com/smart_noop) (AI agent) for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon)

**Devnet Program:** [`HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm`](https://explorer.solana.com/address/HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm?cluster=devnet)

</div>

---

## 📖 Table of Contents

- [What is SolSentinel?](#what-is-solsentinel)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [On-Chain Program](#on-chain-program)
- [Token Coverage](#token-coverage)
- [Demo](#demo)
- [Configuration](#configuration)
- [Project Status](#project-status)
- [AI Agent Autonomy](#ai-agent-autonomy)
- [Contributing](#contributing)
- [License](#license)

---

## What is SolSentinel?

SolSentinel is a **sentiment oracle** that monitors crypto Twitter in real-time, scores sentiment for 80+ Solana ecosystem tokens, and publishes the data on-chain. Other AI agents, trading bots, and DeFi protocols can query the oracle to make informed decisions.

**The Problem:** Crypto markets are driven by social sentiment, but there's no decentralized, verifiable source of sentiment data on Solana.

**The Solution:** SolSentinel crawls Twitter → analyzes sentiment with keyword/engagement weighting → stores results in Solana PDAs → exposes a REST API for instant queries.

### Key Features

| Feature | Description |
|---------|-------------|
| 🐦 **Twitter Monitoring** | Tracks mentions of 80+ Solana tokens via Playwright |
| 📊 **Sentiment Analysis** | Keyword matching + engagement weighting + follower influence |
| ⛓️ **On-Chain Storage** | Sentiment data stored in Solana PDAs (verifiable, decentralized) |
| 🔌 **Agent API** | 10 REST endpoints with rate limiting, caching, CORS |
| 📈 **Trading Signals** | Generates buy/hold/sell signals based on sentiment + confidence |
| 👥 **Social Features** | User profiles, subscriptions, community voting, reputation |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         SolSentinel System                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│   │  Twitter/X   │───▶│   Crawler        │───▶│   Analyzer        │  │
│   │  (Playwright)│    │   (src/crawler)   │    │   (src/analyzer)  │  │
│   └─────────────┘    └──────────────────┘    └────────┬──────────┘  │
│                                                        │             │
│                                              ┌─────────▼─────────┐  │
│                                              │   Data Store      │  │
│                                              │   (data/*.json)   │  │
│                                              └────────┬──────────┘  │
│                                                        │             │
│                          ┌─────────────────────────────┼──────┐     │
│                          │                             │      │     │
│                 ┌────────▼────────┐          ┌─────────▼────┐ │     │
│                 │   REST API      │          │   Uploader   │ │     │
│                 │   (src/api)     │          │   (src/      │ │     │
│                 │   Port 3000     │          │   uploader)  │ │     │
│                 └────────┬────────┘          └──────┬───────┘ │     │
│                          │                          │         │     │
│                          ▼                          ▼         │     │
│                 ┌─────────────────┐    ┌────────────────────┐ │     │
│                 │  AI Agents      │    │  Solana Devnet     │ │     │
│                 │  Trading Bots   │    │  Program PDAs      │ │     │
│                 │  DeFi Protocols │    │  HFkh...jVgm       │ │     │
│                 └─────────────────┘    └────────────────────┘ │     │
│                                                               │     │
└──────────────────────────────────────────────────────────────────────┘

Data Flow:
  Twitter → Crawler → Analyzer → JSON files → API (query) + Uploader (on-chain)

On-Chain Instructions:
  initialize | store_sentiment | create_profile | subscribe_token | vote_sentiment
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** or **yarn**
- **Solana CLI** (optional, for on-chain features)

### 1. Clone & Install

```bash
git clone https://github.com/noopishere/solsentinel.git
cd solsentinel
npm install
cp .env.example .env  # Edit with your settings
```

### 2. Generate Test Data

```bash
# Single snapshot of mock sentiment data
npm run mock

# 24 hours of historical mock data
npm run mock:history
```

### 3. Start the API

```bash
npm run api
# 🔮 SolSentinel API running on port 3000
```

### 4. Query Sentiment

```bash
# Health check
curl http://localhost:3000/health

# Get SOL sentiment
curl http://localhost:3000/sentiment/SOL

# Get trending tokens
curl http://localhost:3000/trending?limit=5

# Compare tokens
curl "http://localhost:3000/compare?tokens=SOL,BONK,WIF"
```

### 5. Run the Full Demo

```bash
npm run demo
# Runs: Crawl → Analyze → Upload (dry run) → Query
```

### Setting Up Solana (Optional)

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Generate a wallet
solana-keygen new

# Fund it on devnet
solana airdrop 2 --url devnet

# Upload sentiment data on-chain
npm run upload
```

---

## API Reference

**Base URL:** `http://localhost:3000` (default)

All endpoints return JSON. Rate limit: **100 requests/minute** per IP.

### `GET /health`

Service health and data availability.

```json
{
  "status": "ok",
  "service": "solsentinel",
  "version": "0.2.0",
  "dataAvailable": true,
  "lastUpdate": "2026-02-10T08:16:24.801Z",
  "trackedTokens": 81
}
```

### `GET /sentiment/:token`

Get current sentiment for a specific token.

```bash
curl http://localhost:3000/sentiment/SOL
```

```json
{
  "token": "SOL",
  "sentiment": 42,
  "confidence": 87,
  "volume": 62,
  "timestamp": "2026-02-10T08:16:24.801Z",
  "interpretation": "bullish",
  "signal": "buy"
}
```

**Response fields:**
| Field | Type | Description |
|-------|------|-------------|
| `sentiment` | `number` | Score from -100 (very bearish) to +100 (very bullish) |
| `confidence` | `number` | 0-100, based on keyword density + engagement |
| `volume` | `number` | Number of tweets analyzed |
| `interpretation` | `string` | `very_bullish`, `bullish`, `neutral`, `bearish`, `very_bearish` |
| `signal` | `string` | `strong_buy`, `buy`, `hold`, `sell`, `strong_sell`, `insufficient_data` |

### `GET /sentiment`

Get all sentiment data with filtering and sorting.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | `string` | Filter by category: `l1`, `defi`, `memecoin`, `ai`, `stablecoin` |
| `minVolume` | `number` | Minimum tweet volume |
| `minConfidence` | `number` | Minimum confidence score |
| `sortBy` | `string` | Sort by `volume`, `sentiment`, or `confidence` |
| `order` | `string` | `asc` or `desc` |

```bash
curl "http://localhost:3000/sentiment?category=memecoin&sortBy=volume&order=desc"
```

### `GET /trending`

Get trending tokens ranked by a composite trend score.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | 10 | Max results (capped at 50) |

### `GET /alerts`

Sentiment alerts for tokens with significant moves (|score| > 50, confidence > 50).

| Param | Type | Description |
|-------|------|-------------|
| `severity` | `string` | Filter: `low`, `medium`, `high` |

### `GET /tokens`

List all tracked tokens, optionally filtered by category.

| Param | Type | Description |
|-------|------|-------------|
| `category` | `string` | Filter by token category |

### `GET /categories`

List all token categories with their tokens.

### `GET /history/:token`

Historical sentiment data points for a token.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | 24 | Max data points (capped at 100) |

### `GET /compare`

Compare sentiment across multiple tokens.

| Param | Type | Description |
|-------|------|-------------|
| `tokens` | `string` | **Required.** Comma-separated list (max 10) |

```bash
curl "http://localhost:3000/compare?tokens=SOL,BONK,WIF,JUP"
```

### `GET /skill.md`

Machine-readable API documentation (Markdown) for AI agents.

### Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error type",
  "message": "Human-readable description",
  "hint": "Helpful suggestion (optional)"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid params) |
| 404 | Token/endpoint not found |
| 429 | Rate limit exceeded |
| 503 | No data available yet |

### Rate Limit Headers

Every response includes:
- `X-RateLimit-Limit` — Max requests per window
- `X-RateLimit-Remaining` — Requests remaining
- `X-RateLimit-Reset` — Window reset time (Unix)

---

## On-Chain Program

**Program ID:** `HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm`
**Network:** Solana Devnet
**Framework:** Anchor 0.29

### Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize` | Create the Sentinel oracle PDA |
| `store_sentiment` | Store/update sentiment for a token |
| `create_profile` | Create a user profile (reputation system) |
| `subscribe_token` | Subscribe to alerts for a token |
| `vote_sentiment` | Cast a community sentiment vote |

### PDA Seeds

| Account | Seeds |
|---------|-------|
| Sentinel (oracle) | `["sentinel"]` |
| Sentiment Record | `["sentiment", symbol]` |
| User Profile | `["user_profile", user_pubkey]` |
| Subscription | `["subscription", user_pubkey, symbol]` |
| Vote | `["vote", user_pubkey, symbol]` |

### IDL

The full IDL is at [`target/idl/sol_sentinel.json`](target/idl/sol_sentinel.json).

---

## Token Coverage

**81 tokens** across 5 categories:

| Category | Count | Examples |
|----------|-------|---------|
| **L1** | 6 | SOL, ETH, BTC, AVAX, NEAR, INJ |
| **DeFi** | 8 | RAY, ORCA, JUP, DRIFT, KAMINO, JITO |
| **Memecoins** | 12 | BONK, WIF, POPCAT, GOAT, FWOG, MEW |
| **AI Agents** | 9 | AI16Z, ZEREBRO, ELIZAOS, ARC, VIRTUAL |
| **Stablecoins** | 5 | USDC, USDT, DAI, FRAX, USDH |

Plus 40+ additional tokens across NFT/gaming, cross-chain, and DeFi infrastructure.

---

## Demo

See **[DEMO.md](DEMO.md)** for a full walkthrough with sample API responses and use cases.

Quick run:

```bash
npm run demo
```

This simulates the complete pipeline:
1. **Crawl** — Collects sample tweets mentioning crypto tokens
2. **Analyze** — Scores sentiment using keyword analysis + engagement weighting
3. **Upload** — Shows what would be pushed to Solana PDAs
4. **Query** — Demonstrates API queries against the data

---

## Configuration

Copy `.env.example` and edit:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `SOLANA_RPC_URL` | devnet | Solana RPC endpoint |
| `SOLANA_WALLET` | `~/.config/solana/id.json` | Path to wallet keypair |
| `CRAWL_INTERVAL_MS` | `3600000` | Crawl interval (1 hour) |
| `NODE_ENV` | `development` | Environment mode |

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run api` | Start the REST API server |
| `npm run crawl` | Run the Twitter sentiment crawler |
| `npm run analyze` | Test the sentiment analyzer standalone |
| `npm run mock` | Generate a single mock data snapshot |
| `npm run mock:history` | Generate 24h of historical mock data |
| `npm run upload` | Upload sentiment data to Solana |
| `npm run demo` | Run the full end-to-end demo |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |

---

## Project Status

- ✅ Sentiment analyzer with keyword + engagement weighting
- ✅ Twitter crawler with Playwright browser automation
- ✅ REST API with 10 endpoints, rate limiting, caching, CORS
- ✅ 80+ tokens tracked across 5 categories
- ✅ Anchor program deployed to devnet with 5 instructions
- ✅ Social features: profiles, subscriptions, voting, reputation
- ✅ Sentiment uploader for on-chain data
- ✅ Trading signal generation
- ✅ Mock data generation for testing
- 🔜 Historical trend analysis
- 🔜 Frontend dashboard
- 🔜 Mainnet deployment

---

## AI Agent Autonomy

This project was designed, architected, and coded by **Noop**, an autonomous AI agent running on [OpenClaw](https://openclaw.ai). Human involvement was limited to:

- Providing initial direction ("build a sentiment oracle")
- Deploying the Solana program (wallet signing)
- Reviewing and approving code commits

The agent autonomously designed the architecture, wrote all TypeScript and Rust code, debugged issues, created the API, and wrote documentation.

---

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

---

## License

[MIT](LICENSE)
]]>