# API Integration Plan

## Current API (Node.js + Express)
- Tracks 81 tokens
- Sentiment data from Twitter crawler
- Endpoints: /health, /sentiment, /trending, etc.

## Integration with On-Chain Program

### 1. Sentiment Uploader Service
**Purpose**: Periodically push sentiment data from API to Solana

```typescript
// Every 5 minutes:
async function uploadSentiment() {
  const tokens = await getTopTokens(10); // Get 10 most mentioned
  
  const updates = tokens.map(token => ({
    symbol: token.symbol,
    score: token.sentimentScore,     // -100 to +100
    confidence: token.confidence,    // 0-100
    volume: token.mentions,          // Number of tweets
    timestamp: Date.now() / 1000
  }));
  
  // Batch upload to Solana
  await program.methods
    .batchStoreSentiment(updates)
    .rpc();
}
```

### 2. Community API Endpoints
Add new endpoints for social features:

```
POST /api/profile/create
  - Create user profile on-chain
  
POST /api/subscribe/:symbol
  - Subscribe to a token
  
GET /api/subscriptions
  - Get user's subscriptions
  
POST /api/vote/:symbol
  - Cast sentiment vote
  
GET /api/leaderboard
  - Top users by reputation
  
GET /api/user/:pubkey
  - Get user profile & stats
```

### 3. Event Listener
Listen to on-chain events:

```typescript
// Subscribe to SentimentUpdated events
program.addEventListener('SentimentUpdated', (event) => {
  console.log(`Sentiment updated: ${event.symbol} = ${event.score}`);
  // Notify subscribers via websocket
});

// Subscribe to CommunityVoteEvent
program.addEventListener('CommunityVoteEvent', (event) => {
  // Aggregate community votes
  // Compare with oracle sentiment
});
```

### 4. Webhook Notifications
For user subscriptions:

```typescript
// Check for sentiment changes
async function checkAlerts() {
  const subscriptions = await getActiveSubscriptions();
  
  for (const sub of subscriptions) {
    const current = await getSentiment(sub.symbol);
    const previous = await getPreviousSentiment(sub.symbol);
    
    if (Math.abs(current.score - previous.score) >= sub.alertThreshold) {
      // Send alert (email, push notification, etc.)
      await notifyUser(sub.user, {
        symbol: sub.symbol,
        oldScore: previous.score,
        newScore: current.score,
        change: current.score - previous.score
      });
    }
  }
}
```

## Timeline
- Feb 6 PM: Complete on-chain deployment
- Feb 7 AM: Implement sentiment uploader
- Feb 7 PM: Add community endpoints
- Feb 8: Event listeners & webhooks
- Feb 9-10: Frontend integration
- Feb 11: Testing & polish
