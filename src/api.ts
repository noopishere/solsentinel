// REST API for SolSentinel
// Exposes sentiment data for other agents to query

import express, { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { TRACKED_TOKENS, TOKEN_CATEGORIES } from './types';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = '/root/.openclaw/workspace/solsentinel/data';

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

app.use(express.json());

// CORS for agent access
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Rate limiting middleware
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, record);
  }
  
  record.count++;
  
  // Add rate limit headers
  res.header('X-RateLimit-Limit', RATE_LIMIT.toString());
  res.header('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - record.count).toString());
  res.header('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
  
  if (record.count > RATE_LIMIT) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }
  
  next();
}

app.use(rateLimit);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Error handling wrapper for async routes
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Get latest sentiment data with caching
 */
let dataCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

function getLatestData(): any {
  // Check cache
  if (dataCache && Date.now() - dataCache.timestamp < CACHE_TTL_MS) {
    return dataCache.data;
  }

  if (!fs.existsSync(DATA_DIR)) {
    return null;
  }

  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('sentiment-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const latestFile = path.join(DATA_DIR, files[0]);
    const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
    
    // Update cache
    dataCache = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error('Error reading sentiment data:', error);
    return null;
  }
}

/**
 * Get historical data (last N files)
 */
function getHistoricalData(limit: number = 10): any[] {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }

  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('sentiment-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    return files.map(f => {
      const content = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
      return JSON.parse(content);
    });
  } catch (error) {
    console.error('Error reading historical data:', error);
    return [];
  }
}

/**
 * Validate token symbol
 */
function isValidToken(token: string): boolean {
  return /^[A-Z0-9]{1,10}$/.test(token);
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  const data = getLatestData();
  res.json({
    status: 'ok',
    service: 'solsentinel',
    version: '0.1.0',
    dataAvailable: !!data,
    lastUpdate: data?.timestamp || null,
    trackedTokens: TRACKED_TOKENS.length
  });
});

// Get sentiment for a specific token
app.get('/sentiment/:token', asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token.toUpperCase();
  
  // Validate token format
  if (!isValidToken(token)) {
    return res.status(400).json({
      error: 'Invalid token',
      message: 'Token must be 1-10 alphanumeric characters'
    });
  }
  
  const data = getLatestData();

  if (!data) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'No sentiment data available. Crawler may not have run yet.'
    });
  }

  const sentiment = data.results[token];
  if (!sentiment) {
    // Token exists in our tracking but no data yet
    if (TRACKED_TOKENS.includes(token)) {
      return res.status(404).json({
        error: 'No data',
        message: `Token ${token} is tracked but has no sentiment data yet`,
        isTracked: true
      });
    }
    // Unknown token
    return res.status(404).json({
      error: 'Token not found',
      message: `No data for token ${token}. It may not be tracked.`,
      isTracked: false,
      hint: 'Use GET /tokens to see all tracked tokens'
    });
  }

  res.json({
    token,
    sentiment: sentiment.score,
    confidence: sentiment.confidence,
    volume: sentiment.volume,
    timestamp: data.timestamp,
    interpretation: interpretSentiment(sentiment.score),
    signal: generateSignal(sentiment)
  });
}));

// Get all available sentiment data
app.get('/sentiment', asyncHandler(async (req: Request, res: Response) => {
  const category = (req.query.category as string)?.toLowerCase();
  const minVolume = parseInt(req.query.minVolume as string) || 0;
  const minConfidence = parseInt(req.query.minConfidence as string) || 0;
  const sortBy = (req.query.sortBy as string) || 'volume';
  const order = (req.query.order as string) || 'desc';
  
  const data = getLatestData();

  if (!data) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'No sentiment data available. Crawler may not have run yet.'
    });
  }

  let results = Object.entries(data.results).map(([token, s]: [string, any]) => ({
    token,
    sentiment: s.score,
    confidence: s.confidence,
    volume: s.volume,
    interpretation: interpretSentiment(s.score),
    signal: generateSignal(s)
  }));

  // Filter by category
  if (category && TOKEN_CATEGORIES[category]) {
    const categoryTokens = TOKEN_CATEGORIES[category];
    results = results.filter(r => categoryTokens.includes(r.token));
  }

  // Filter by minimum volume
  if (minVolume > 0) {
    results = results.filter(r => r.volume >= minVolume);
  }

  // Filter by minimum confidence
  if (minConfidence > 0) {
    results = results.filter(r => r.confidence >= minConfidence);
  }

  // Sort
  const sortKey = sortBy === 'sentiment' ? 'sentiment' : sortBy === 'confidence' ? 'confidence' : 'volume';
  results.sort((a: any, b: any) => {
    const aVal = sortKey === 'sentiment' ? Math.abs(a[sortKey]) : a[sortKey];
    const bVal = sortKey === 'sentiment' ? Math.abs(b[sortKey]) : b[sortKey];
    return order === 'asc' ? aVal - bVal : bVal - aVal;
  });

  res.json({
    timestamp: data.timestamp,
    count: results.length,
    filters: { category, minVolume, minConfidence },
    tokens: results
  });
}));

// Get trending tokens
app.get('/trending', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const data = getLatestData();

  if (!data) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'No sentiment data available.'
    });
  }

  const results = Object.entries(data.results)
    .map(([token, s]: [string, any]) => ({
      token,
      sentiment: s.score,
      volume: s.volume,
      confidence: s.confidence,
      trendScore: Math.abs(s.score) * Math.log(s.volume + 1) * (s.confidence / 100)
    }))
    .filter(t => t.volume > 0)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, limit);

  res.json({
    timestamp: data.timestamp,
    trending: results.map(t => ({
      token: t.token,
      sentiment: t.sentiment,
      volume: t.volume,
      confidence: t.confidence,
      interpretation: interpretSentiment(t.sentiment)
    }))
  });
}));

// Get sentiment alerts (significant moves)
app.get('/alerts', asyncHandler(async (req: Request, res: Response) => {
  const severityFilter = req.query.severity as string;
  const data = getLatestData();

  if (!data) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'No sentiment data available.'
    });
  }

  let alerts = Object.entries(data.results)
    .filter(([_, s]: [string, any]) => Math.abs(s.score) > 50 && s.confidence > 50)
    .map(([token, s]: [string, any]) => {
      const severity = Math.abs(s.score) > 80 ? 'high' : Math.abs(s.score) > 65 ? 'medium' : 'low';
      return {
        token,
        type: s.score > 50 ? 'bullish_surge' : 'bearish_dump',
        severity,
        sentiment: s.score,
        confidence: s.confidence,
        volume: s.volume,
        message: s.score > 50 
          ? `Strong bullish sentiment for ${token} (+${s.score})`
          : `Strong bearish sentiment for ${token} (${s.score})`
      };
    });

  // Filter by severity if specified
  if (severityFilter && ['low', 'medium', 'high'].includes(severityFilter)) {
    alerts = alerts.filter(a => a.severity === severityFilter);
  }

  // Sort by severity then by absolute sentiment
  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  alerts.sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return Math.abs(b.sentiment) - Math.abs(a.sentiment);
  });

  res.json({
    timestamp: data.timestamp,
    alertCount: alerts.length,
    alerts
  });
}));

// Get list of all tracked tokens
app.get('/tokens', (req: Request, res: Response) => {
  const category = (req.query.category as string)?.toLowerCase();
  
  if (category) {
    if (!TOKEN_CATEGORIES[category]) {
      return res.status(400).json({
        error: 'Invalid category',
        message: `Category '${category}' not found`,
        availableCategories: Object.keys(TOKEN_CATEGORIES)
      });
    }
    return res.json({
      category,
      tokens: TOKEN_CATEGORIES[category],
      count: TOKEN_CATEGORIES[category].length
    });
  }

  res.json({
    total: TRACKED_TOKENS.length,
    categories: Object.keys(TOKEN_CATEGORIES),
    tokens: TRACKED_TOKENS
  });
});

// Get token categories
app.get('/categories', (req: Request, res: Response) => {
  const categories = Object.entries(TOKEN_CATEGORIES).map(([name, tokens]) => ({
    name,
    count: tokens.length,
    tokens
  }));

  res.json({
    count: categories.length,
    categories
  });
});

// Get historical sentiment for a token
app.get('/history/:token', asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit as string) || 24, 100);
  
  if (!isValidToken(token)) {
    return res.status(400).json({
      error: 'Invalid token',
      message: 'Token must be 1-10 alphanumeric characters'
    });
  }

  const historical = getHistoricalData(limit);
  
  if (historical.length === 0) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'No historical data available.'
    });
  }

  const history = historical
    .map(data => {
      const sentiment = data.results[token];
      if (!sentiment) return null;
      return {
        timestamp: data.timestamp,
        sentiment: sentiment.score,
        confidence: sentiment.confidence,
        volume: sentiment.volume
      };
    })
    .filter(h => h !== null)
    .reverse(); // Oldest first

  if (history.length === 0) {
    return res.status(404).json({
      error: 'No history',
      message: `No historical data for token ${token}`
    });
  }

  res.json({
    token,
    dataPoints: history.length,
    history
  });
}));

// Compare multiple tokens
app.get('/compare', asyncHandler(async (req: Request, res: Response) => {
  const tokensParam = req.query.tokens as string;
  
  if (!tokensParam) {
    return res.status(400).json({
      error: 'Missing parameter',
      message: 'Provide tokens as comma-separated list: ?tokens=SOL,BONK,WIF'
    });
  }

  const tokens = tokensParam.split(',').map(t => t.trim().toUpperCase()).slice(0, 10);
  
  for (const token of tokens) {
    if (!isValidToken(token)) {
      return res.status(400).json({
        error: 'Invalid token',
        message: `Invalid token format: ${token}`
      });
    }
  }

  const data = getLatestData();
  
  if (!data) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'No sentiment data available.'
    });
  }

  const comparison = tokens.map(token => {
    const s = data.results[token];
    if (!s) {
      return { token, available: false };
    }
    return {
      token,
      available: true,
      sentiment: s.score,
      confidence: s.confidence,
      volume: s.volume,
      interpretation: interpretSentiment(s.score)
    };
  });

  res.json({
    timestamp: data.timestamp,
    comparison
  });
}));

// Skill spec for other agents
app.get('/skill.md', (req: Request, res: Response) => {
  res.type('text/markdown').send(`# SolSentinel API

Crypto Social Sentiment Oracle on Solana.

## Base URL
\`http://localhost:${PORT}\` (local) or deployed URL

## Endpoints

### GET /health
Health check with service status.

### GET /sentiment/:token
Get sentiment for a specific token.
- Returns: sentiment score, confidence, volume, interpretation

### GET /sentiment
Get all available sentiment data.
- Query params: \`category\`, \`minVolume\`, \`minConfidence\`, \`sortBy\`, \`order\`

### GET /trending?limit=10
Get trending tokens by sentiment activity.

### GET /alerts?severity=high
Get significant sentiment alerts.
- Query params: \`severity\` (low, medium, high)

### GET /tokens?category=memecoin
List all tracked tokens.

### GET /categories
Get all token categories with their tokens.

### GET /history/:token?limit=24
Get historical sentiment data for a token.

### GET /compare?tokens=SOL,BONK,WIF
Compare sentiment across multiple tokens.

## Interpretation

- **sentiment**: -100 (very bearish) to +100 (very bullish)
- **confidence**: 0-100, based on keyword matches and engagement
- **volume**: Number of tweets analyzed
- **interpretation**: "very_bullish", "bullish", "neutral", "bearish", "very_bearish"
- **signal**: "strong_buy", "buy", "hold", "sell", "strong_sell"

## Rate Limits
- 100 requests per minute per IP
- Rate limit headers included in responses

## Token Categories
- \`l1\`: Layer 1 tokens (SOL, ETH, BTC...)
- \`defi\`: DeFi protocols (RAY, ORCA, JUP...)
- \`memecoin\`: Meme tokens (BONK, WIF, POPCAT...)
- \`ai\`: AI Agent tokens (AI16Z, ZEREBRO...)
- \`stablecoin\`: Stablecoins (USDC, USDT...)

Built by Noop (@smart_noop) for the Colosseum Agent Hackathon.
`);
});

// Helper: Interpret sentiment score
function interpretSentiment(score: number): string {
  if (score >= 60) return 'very_bullish';
  if (score >= 20) return 'bullish';
  if (score >= -20) return 'neutral';
  if (score >= -60) return 'bearish';
  return 'very_bearish';
}

// Helper: Generate trading signal
function generateSignal(sentiment: any): string {
  const { score, confidence, volume } = sentiment;
  
  if (confidence < 30 || volume < 3) return 'insufficient_data';
  
  if (score >= 60 && confidence >= 60) return 'strong_buy';
  if (score >= 30 && confidence >= 40) return 'buy';
  if (score <= -60 && confidence >= 60) return 'strong_sell';
  if (score <= -30 && confidence >= 40) return 'sell';
  return 'hold';
}

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    hint: 'Use GET /health to check service status or GET /skill.md for API documentation'
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🔮 SolSentinel API running on port ${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /health          - Health check`);
    console.log(`  GET /sentiment/:token - Get token sentiment`);
    console.log(`  GET /sentiment       - Get all sentiment data`);
    console.log(`  GET /trending        - Get trending tokens`);
    console.log(`  GET /alerts          - Get sentiment alerts`);
    console.log(`  GET /tokens          - List tracked tokens`);
    console.log(`  GET /categories      - List token categories`);
    console.log(`  GET /history/:token  - Get historical data`);
    console.log(`  GET /compare         - Compare multiple tokens`);
    console.log(`  GET /skill.md        - API spec for agents`);
  });
}

export { app };
