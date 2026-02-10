# SolSentinel 🔮

**Crypto Social Sentiment Oracle on Solana**

Built autonomously by [Noop](https://x.com/smart_noop) (AI agent) for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon)

**Devnet Program:** `HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm`

## What is SolSentinel?

SolSentinel monitors crypto Twitter in real-time, analyzes sentiment around tokens and narratives, and stores findings on-chain. Other agents can query the oracle to make informed decisions.

## Features

- 🐦 **Twitter Monitoring** - Tracks mentions of 80+ Solana tokens and keywords
- 📊 **Sentiment Analysis** - Classifies content as bullish/bearish/neutral with confidence scores
- ⛓️ **On-Chain Storage** - Sentiment data stored in Solana PDAs
- 🔌 **Agent API** - Comprehensive REST endpoints with rate limiting & error handling
- 📈 **Trading Signals** - Generate buy/hold/sell signals based on sentiment

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Twitter/X      │────▶│  SolSentinel    │────▶│  Solana Program │
│  (Data Source)  │     │  Agent          │     │  (PDAs)         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  REST API       │
                        │  (Query Layer)  │
                        └─────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Run the full demo (crawl → analyze → upload → query)
npm run demo

# Generate test data (if you don't have real Twitter data)
npm run mock              # Single snapshot
npm run mock:history      # 24 hours of historical data

# Start the API server
npm run api

# Run the sentiment crawler (requires Playwright + Twitter access)
npm run crawl

# Upload sentiment data on-chain (requires Solana wallet)
npm run upload

# Test the analyzer standalone
npm run analyze
```

### Setting Up Solana (for on-chain uploads)

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Generate a wallet
solana-keygen new

# Fund it on devnet
solana airdrop 2 --url devnet

# Upload sentiment data
npm run upload
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health with data availability status |
| `GET /sentiment/:token` | Get sentiment for a specific token |
| `GET /sentiment` | Get all sentiment data (filterable) |
| `GET /trending?limit=10` | Get trending tokens by sentiment activity |
| `GET /alerts?severity=high` | Get sentiment alerts (significant moves) |
| `GET /tokens?category=memecoin` | List all tracked tokens |
| `GET /categories` | Get all token categories |
| `GET /history/:token?limit=24` | Historical sentiment data |
| `GET /compare?tokens=SOL,BONK,WIF` | Compare multiple tokens |
| `GET /skill.md` | API documentation for agents |

### Query Parameters

- `category`: Filter by token category (l1, defi, memecoin, ai, stablecoin)
- `minVolume`: Minimum tweet volume
- `minConfidence`: Minimum confidence score
- `sortBy`: Sort by volume, sentiment, or confidence
- `order`: asc or desc

### Response Fields

- **sentiment**: -100 (very bearish) to +100 (very bullish)
- **confidence**: 0-100, based on keyword matches and engagement
- **volume**: Number of tweets analyzed
- **interpretation**: very_bullish, bullish, neutral, bearish, very_bearish
- **signal**: strong_buy, buy, hold, sell, strong_sell, insufficient_data

## Token Categories

- **L1**: SOL, ETH, BTC, AVAX, NEAR, INJ
- **DeFi**: RAY, ORCA, JUP, DRIFT, KAMINO, JITO, BLZE...
- **Memecoins**: BONK, WIF, SAMO, BOME, POPCAT, MEW, MYRO, SLERF...
- **AI Agents**: AI16Z, GRIFFAIN, ZEREBRO, ELIZAOS, ARC, VIRTUAL, TAO...
- **Stablecoins**: USDC, USDT, DAI, FRAX, USDH

## Solana Integration

Sentiment records are stored on-chain using PDAs derived from:
- Token mint address (or symbol hash)
- Timestamp bucket (hourly)

This provides:
- Verifiable history of sentiment calls
- Decentralized data availability
- Integration with other Solana programs

## Tech Stack

- **Agent**: TypeScript + Playwright (browser automation)
- **Program**: Anchor (Rust) - [see programs/sol_sentinel]
- **API**: Express.js with rate limiting & caching
- **Data**: Solana PDAs + local JSON cache

## Project Status

- ✅ Sentiment analyzer with keyword detection
- ✅ Twitter crawler with Playwright
- ✅ REST API with comprehensive endpoints
- ✅ Rate limiting & error handling
- ✅ 80+ tokens tracked across 5 categories
- ✅ Real-time data collection working
- ✅ Anchor program deployed to devnet
- ✅ Sentiment uploader for on-chain data
- 🔜 Historical trend analysis

## AI Agent Autonomy

This project was designed, architected, and coded by **Noop**, an autonomous AI agent running on [OpenClaw](https://openclaw.ai). Human involvement was limited to:

- Providing initial project direction ("build a sentiment oracle")
- Deploying the Solana program (wallet signing)
- Reviewing and approving code commits

The agent autonomously:
- Designed the system architecture
- Wrote all TypeScript and Rust code
- Debugged compilation errors and fixed issues
- Created the API schema and endpoints
- Wrote documentation and README
- Iterated on features based on testing

## Example Usage

```bash
# Get SOL sentiment
curl http://localhost:3000/sentiment/SOL
# {"token":"SOL","sentiment":70,"confidence":95,"volume":7,"interpretation":"very_bullish","signal":"strong_buy"}

# Get trending tokens
curl http://localhost:3000/trending?limit=5

# Compare tokens
curl "http://localhost:3000/compare?tokens=SOL,BTC,BONK"

# Historical sentiment
curl http://localhost:3000/history/SOL?limit=24

# Filter by category
curl "http://localhost:3000/sentiment?category=memecoin&sortBy=volume"

# Health check
curl http://localhost:3000/health
```

## Demo

Run the full end-to-end demo to see SolSentinel in action:

```bash
npm run demo
```

This simulates the complete flow:
1. **Crawl** — Collects tweets mentioning crypto tokens
2. **Analyze** — Scores sentiment using keyword analysis + engagement weighting
3. **Upload** — Pushes results to Solana PDAs (dry run without wallet)
4. **Query** — Fetches results from the REST API

## License

MIT
