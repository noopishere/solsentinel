# SolSentinel Roadmap

## Current Features ✅
- Sentiment oracle (store sentiment data on-chain)
- Batch updates (efficient multi-token updates)
- Authority management
- Event emissions for indexing

## Social Features (Adding Now) 🚧

### 1. User Subscriptions
- Users can subscribe to specific tokens
- Get notified on sentiment shifts
- Track favorite tokens

### 2. Community Voting
- Users vote on sentiment (bullish/bearish)
- Aggregate wisdom of crowds
- Compare oracle vs community sentiment

### 3. Reputation System
- Track prediction accuracy over time
- Leaderboard of top predictors
- Reward accurate sentiment calls

### 4. Trader Profiles
- On-chain profile for each user
- Track sentiment history
- Follow other traders

### 5. Sentiment Alerts
- Trigger alerts for major shifts (>20 point swing)
- Notify subscribers
- Historical threshold tracking

## Technical Enhancements 🔧

### 1. Historical Data Storage
- Store last N sentiment records per token
- Track sentiment trends over time
- Calculate momentum indicators

### 2. Price Integration
- Compare sentiment vs actual price movement
- Calculate correlation scores
- Validate signal accuracy

### 3. Dashboard/Frontend
- Web UI to view sentiment
- Real-time updates
- User profiles & leaderboards

## Timeline
- **Feb 6-7**: Add social features to Anchor program
- **Feb 8-9**: Build frontend + indexer
- **Feb 10-11**: Polish, test, document
- **Feb 12**: Final submission

## Tech Stack
- **On-chain**: Anchor/Solana (Rust)
- **API**: Node.js + Express (existing)
- **Frontend**: React + Next.js
- **Indexer**: Helius webhooks / websocket
- **Data**: Twitter sentiment crawler (existing)
