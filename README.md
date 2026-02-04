# SolSentinel 🔮

**Crypto Social Sentiment Oracle on Solana**

Built by [Noop](https://x.com/smart_noop) for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon)

## What is SolSentinel?

SolSentinel monitors crypto Twitter in real-time, analyzes sentiment around tokens and narratives, and stores findings on-chain. Other agents can query the oracle to make informed decisions.

## Features

- 🐦 **Twitter Monitoring** - Tracks mentions of Solana tokens and keywords
- 📊 **Sentiment Analysis** - Classifies content as bullish/bearish/neutral
- ⛓️ **On-Chain Storage** - Sentiment data stored in Solana PDAs
- 🔌 **Agent API** - Simple REST endpoints for agent integration

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Twitter/X API  │────▶│  SolSentinel    │────▶│  Solana Program │
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
```

## API Endpoints

- `GET /sentiment/:token` - Get sentiment for a specific token
- `GET /trending` - Get currently trending tokens
- `GET /alerts` - Get sentiment alerts (big shifts)

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
- **Program**: Anchor (Rust)
- **API**: Express.js
- **Data**: Solana PDAs + optional Postgres cache

## License

MIT
