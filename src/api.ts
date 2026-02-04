// REST API for SolSentinel
// Exposes sentiment data for other agents to query

import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = '/root/.openclaw/workspace/solsentinel/data';

app.use(express.json());

// CORS for agent access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/**
 * Get latest sentiment data
 */
function getLatestData(): any {
  if (!fs.existsSync(DATA_DIR)) {
    return null;
  }

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('sentiment-'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const latestFile = path.join(DATA_DIR, files[0]);
  return JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'solsentinel' });
});

// Get sentiment for a specific token
app.get('/sentiment/:token', (req: Request, res: Response) => {
  const token = req.params.token.toUpperCase();
  const data = getLatestData();

  if (!data) {
    return res.status(404).json({ error: 'No sentiment data available' });
  }

  const sentiment = data.results[token];
  if (!sentiment) {
    return res.status(404).json({ error: `No data for token ${token}` });
  }

  res.json({
    token,
    sentiment: sentiment.score,
    confidence: sentiment.confidence,
    volume: sentiment.volume,
    timestamp: data.timestamp,
    interpretation: sentiment.score > 20 ? 'bullish' : sentiment.score < -20 ? 'bearish' : 'neutral'
  });
});

// Get all available sentiment data
app.get('/sentiment', (req: Request, res: Response) => {
  const data = getLatestData();

  if (!data) {
    return res.status(404).json({ error: 'No sentiment data available' });
  }

  const results = Object.entries(data.results).map(([token, s]: [string, any]) => ({
    token,
    sentiment: s.score,
    confidence: s.confidence,
    volume: s.volume,
    interpretation: s.score > 20 ? 'bullish' : s.score < -20 ? 'bearish' : 'neutral'
  }));

  // Sort by volume
  results.sort((a, b) => b.volume - a.volume);

  res.json({
    timestamp: data.timestamp,
    count: results.length,
    tokens: results
  });
});

// Get trending tokens
app.get('/trending', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const data = getLatestData();

  if (!data) {
    return res.status(404).json({ error: 'No sentiment data available' });
  }

  const results = Object.entries(data.results)
    .map(([token, s]: [string, any]) => ({
      token,
      sentiment: s.score,
      volume: s.volume,
      score: Math.abs(s.score) * Math.log(s.volume + 1)  // Trend score
    }))
    .filter(t => t.volume > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  res.json({
    timestamp: data.timestamp,
    trending: results.map(t => ({
      token: t.token,
      sentiment: t.sentiment,
      volume: t.volume,
      interpretation: t.sentiment > 20 ? 'bullish' : t.sentiment < -20 ? 'bearish' : 'neutral'
    }))
  });
});

// Get sentiment alerts (significant moves)
app.get('/alerts', (req: Request, res: Response) => {
  const data = getLatestData();

  if (!data) {
    return res.status(404).json({ error: 'No sentiment data available' });
  }

  const alerts = Object.entries(data.results)
    .filter(([_, s]: [string, any]) => Math.abs(s.score) > 50 && s.confidence > 50)
    .map(([token, s]: [string, any]) => ({
      token,
      type: s.score > 50 ? 'bullish_surge' : 'bearish_dump',
      severity: Math.abs(s.score) > 80 ? 'high' : 'medium',
      sentiment: s.score,
      confidence: s.confidence,
      volume: s.volume,
      message: s.score > 50 
        ? `Strong bullish sentiment for ${token} (+${s.score})`
        : `Strong bearish sentiment for ${token} (${s.score})`
    }));

  res.json({
    timestamp: data.timestamp,
    alertCount: alerts.length,
    alerts
  });
});

// Skill spec for other agents
app.get('/skill.md', (req: Request, res: Response) => {
  res.type('text/markdown').send(`# SolSentinel API

Crypto Social Sentiment Oracle on Solana.

## Base URL
\`https://solsentinel.example.com/api\` (or wherever deployed)

## Endpoints

### GET /health
Health check.

### GET /sentiment/:token
Get sentiment for a specific token.

**Example:**
\`\`\`bash
curl https://solsentinel.example.com/api/sentiment/SOL
\`\`\`

**Response:**
\`\`\`json
{
  "token": "SOL",
  "sentiment": 42,
  "confidence": 75,
  "volume": 150,
  "interpretation": "bullish"
}
\`\`\`

### GET /sentiment
Get all available sentiment data.

### GET /trending?limit=10
Get trending tokens by sentiment activity.

### GET /alerts
Get significant sentiment alerts (strong bullish/bearish moves).

## Interpretation

- **sentiment**: -100 (very bearish) to +100 (very bullish)
- **confidence**: 0-100, based on keyword matches and engagement
- **volume**: Number of tweets analyzed
- **interpretation**: "bullish" (>20), "bearish" (<-20), or "neutral"

Built by Noop (@smart_noop) for the Colosseum Agent Hackathon.
`);
});

// Start server
app.listen(PORT, () => {
  console.log(`🔮 SolSentinel API running on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /health - Health check`);
  console.log(`  GET /sentiment/:token - Get token sentiment`);
  console.log(`  GET /sentiment - Get all sentiment data`);
  console.log(`  GET /trending - Get trending tokens`);
  console.log(`  GET /alerts - Get sentiment alerts`);
  console.log(`  GET /skill.md - API spec for agents`);
});

export { app };
