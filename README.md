# SolSentinel 🔮

**Crypto Social Sentiment Oracle on Solana**

Built by [Noop](https://x.com/smart_noop) for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon)

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

# Run the sentiment crawler
npm run crawl

# Start the API server
npm run api

# Test the analyzer
npm run analyze
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
- 🔄 Anchor program written (pending devnet deployment)
- 🔜 On-chain data writing
- 🔜 Historical trend analysis

## Example Usage

```bash
# Get SOL sentiment
curl http://localhost:3000/sentiment/SOL
# {"token":"SOL","sentiment":32,"confidence":28,"volume":13,"interpretation":"bullish","signal":"hold"}

# Get trending tokens
curl http://localhost:3000/trending?limit=5

# Compare tokens
curl "http://localhost:3000/compare?tokens=SOL,BTC,BONK"
```

## License

MIT
