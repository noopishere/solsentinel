<![CDATA[# 🔮 SolSentinel Demo

This document walks through SolSentinel's capabilities with real sample responses and use cases.

## Quick Demo

```bash
npm run demo
```

This runs the full pipeline: Crawl → Analyze → Upload → Query.

---

## Sample API Responses

### 1. Health Check

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "service": "solsentinel",
  "version": "0.1.0",
  "dataAvailable": true,
  "lastUpdate": "2026-02-10T08:16:24.801Z",
  "trackedTokens": 81
}
```

### 2. Single Token Sentiment

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

### 3. Memecoin Category

```bash
curl "http://localhost:3000/sentiment?category=memecoin&sortBy=volume&order=desc"
```

```json
{
  "timestamp": "2026-02-10T08:16:24.801Z",
  "count": 12,
  "filters": { "category": "memecoin", "minVolume": 0, "minConfidence": 0 },
  "tokens": [
    { "token": "BONK", "sentiment": 55, "confidence": 78, "volume": 45, "interpretation": "bullish", "signal": "buy" },
    { "token": "WIF", "sentiment": 32, "confidence": 65, "volume": 38, "interpretation": "bullish", "signal": "buy" },
    { "token": "POPCAT", "sentiment": -15, "confidence": 42, "volume": 22, "interpretation": "neutral", "signal": "hold" },
    { "token": "GOAT", "sentiment": 71, "confidence": 80, "volume": 18, "interpretation": "very_bullish", "signal": "strong_buy" }
  ]
}
```

### 4. Trending Tokens

```bash
curl http://localhost:3000/trending?limit=5
```

```json
{
  "timestamp": "2026-02-10T08:16:24.801Z",
  "trending": [
    { "token": "SOL", "sentiment": 42, "volume": 62, "confidence": 87, "interpretation": "bullish" },
    { "token": "BONK", "sentiment": 55, "volume": 45, "confidence": 78, "interpretation": "bullish" },
    { "token": "AI16Z", "sentiment": 68, "volume": 33, "confidence": 72, "interpretation": "very_bullish" },
    { "token": "JUP", "sentiment": -22, "volume": 28, "confidence": 60, "interpretation": "bearish" },
    { "token": "WIF", "sentiment": 32, "volume": 38, "confidence": 65, "interpretation": "bullish" }
  ]
}
```

### 5. Sentiment Alerts

```bash
curl http://localhost:3000/alerts?severity=high
```

```json
{
  "timestamp": "2026-02-10T08:16:24.801Z",
  "alertCount": 2,
  "alerts": [
    {
      "token": "GOAT",
      "type": "bullish_surge",
      "severity": "high",
      "sentiment": 85,
      "confidence": 75,
      "volume": 18,
      "message": "Strong bullish sentiment for GOAT (+85)"
    },
    {
      "token": "SLERF",
      "type": "bearish_dump",
      "severity": "high",
      "sentiment": -82,
      "confidence": 68,
      "volume": 12,
      "message": "Strong bearish sentiment for SLERF (-82)"
    }
  ]
}
```

### 6. Token Comparison

```bash
curl "http://localhost:3000/compare?tokens=SOL,ETH,BTC,BONK"
```

```json
{
  "timestamp": "2026-02-10T08:16:24.801Z",
  "comparison": [
    { "token": "SOL", "available": true, "sentiment": 42, "confidence": 87, "volume": 62, "interpretation": "bullish" },
    { "token": "ETH", "available": true, "sentiment": -8, "confidence": 55, "volume": 30, "interpretation": "neutral" },
    { "token": "BTC", "available": true, "sentiment": 25, "confidence": 70, "volume": 41, "interpretation": "bullish" },
    { "token": "BONK", "available": true, "sentiment": 55, "confidence": 78, "volume": 45, "interpretation": "bullish" }
  ]
}
```

### 7. Historical Data

```bash
curl http://localhost:3000/history/SOL?limit=5
```

```json
{
  "token": "SOL",
  "dataPoints": 5,
  "history": [
    { "timestamp": "2026-02-10T04:16:24.801Z", "sentiment": 35, "confidence": 82, "volume": 48 },
    { "timestamp": "2026-02-10T05:16:24.801Z", "sentiment": 38, "confidence": 85, "volume": 55 },
    { "timestamp": "2026-02-10T06:16:24.801Z", "sentiment": 40, "confidence": 84, "volume": 51 },
    { "timestamp": "2026-02-10T07:16:24.801Z", "sentiment": 44, "confidence": 88, "volume": 60 },
    { "timestamp": "2026-02-10T08:16:24.801Z", "sentiment": 42, "confidence": 87, "volume": 62 }
  ]
}
```

---

## Use Cases

### 🤖 AI Trading Agent

An AI trading agent queries SolSentinel before executing trades:

```python
import requests

# Check sentiment before buying
resp = requests.get("http://localhost:3000/sentiment/BONK")
data = resp.json()

if data["signal"] in ["strong_buy", "buy"] and data["confidence"] > 60:
    print(f"✅ Buying BONK — sentiment: {data['sentiment']}, signal: {data['signal']}")
    # execute_trade("BONK", "buy")
else:
    print(f"⏸️ Holding — sentiment: {data['sentiment']}, signal: {data['signal']}")
```

### 📊 Portfolio Sentiment Dashboard

Monitor sentiment across your portfolio:

```bash
curl "http://localhost:3000/compare?tokens=SOL,JUP,BONK,RAY,DRIFT"
```

### 🚨 Alert-Driven Notifications

Poll `/alerts` to trigger notifications on major sentiment shifts:

```javascript
const alerts = await fetch("http://localhost:3000/alerts?severity=high").then(r => r.json());
for (const alert of alerts.alerts) {
  sendNotification(`⚠️ ${alert.token}: ${alert.message}`);
}
```

### 📈 Memecoin Screener

Find the hottest memecoins by social activity:

```bash
curl "http://localhost:3000/sentiment?category=memecoin&sortBy=volume&order=desc&minConfidence=50"
```

### 🔗 DeFi Protocol Integration

A lending protocol could adjust risk parameters based on sentiment:

```
IF sentiment(TOKEN) < -60 AND confidence > 70:
    increase_collateral_ratio(TOKEN, +10%)
    
IF sentiment(TOKEN) > 60 AND confidence > 70:
    decrease_collateral_ratio(TOKEN, -5%)
```

---

## On-Chain Verification

Sentiment data stored on Solana can be verified by anyone:

```bash
# View the deployed program
solana program show HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm --url devnet

# Sentiment records are stored as PDAs:
# Seeds: ["sentiment", <TOKEN_SYMBOL>]
# Contains: score, confidence, volume, timestamp, authority
```

---

## Demo Script Output

Running `npm run demo` produces:

```
  ╔══════════════════════════════════════════════════╗
  ║  🔮 SolSentinel Demo — Full Flow                ║
  ║  Crawl → Analyze → Upload → Query               ║
  ╚══════════════════════════════════════════════════╝

════════════════════════════════════════════════════════════
  🐦 STEP 1: Crawl Twitter (simulated)
════════════════════════════════════════════════════════════

  Collected 15 tweets mentioning crypto tokens
    @sol_maxi: "$SOL breaking out! This pump is just getting started 🚀🚀..."
    @defi_chad: "$SOL staking rewards are insane rn, accumulate while you..."
    @bonk_degen: "Just aped $BONK with my whole portfolio. wagmi frens 🔥..."
    ...

════════════════════════════════════════════════════════════
  📊 STEP 2: Analyze Sentiment
════════════════════════════════════════════════════════════

  Analyzed 15 tweets across 12 tokens:

    🟢 SOL        +70  conf:  95%  vol:2  ████████████████
    🟢 BONK       +20  conf:  60%  vol:2  ████
    🔴 JUP        -10  conf:  55%  vol:2  ██
    🟢 WIF        +15  conf:  40%  vol:2  ███
    🟢 AI16Z      +80  conf:  70%  vol:1  ████████████████

════════════════════════════════════════════════════════════
  ⛓️  STEP 3: Upload to Solana (dry run)
════════════════════════════════════════════════════════════

  Tokens that would be uploaded:

    🟢 SOL: score=70, confidence=95%
       → PDA: [sentiment, "SOL"] on program HFkh...jVgm
    🟢 BONK: score=20, confidence=60%
       → PDA: [sentiment, "BONK"] on program HFkh...jVgm

════════════════════════════════════════════════════════════
  ✅ Demo Complete!
════════════════════════════════════════════════════════════
```
]]>