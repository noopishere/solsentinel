// REST API + WebSocket server for SolSentinel
// Exposes sentiment data for agents, dashboards, and real-time subscribers

import express, { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  TRACKED_TOKENS,
  TOKEN_CATEGORIES,
  SentimentInterpretation,
  TradingSignal,
  HealthResponse,
  TokenSentimentResponse,
  HistoryPoint,
  ComparisonEntry,
  SentimentAlert,
  AlertSeverity,
  WSClientMessage,
  WSServerMessage,
} from './types';

// ── Config ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || '/root/.openclaw/workspace/solsentinel/data';
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100', 10);
const RATE_WINDOW_MS = 60_000;
const CACHE_TTL_MS = 30_000;
const VERSION = '0.2.0';

const app = express();
const server = http.createServer(app);

// ── Startup timestamp ────────────────────────────────────────────────

const startedAt = Date.now();

// ── Rate limiting ────────────────────────────────────────────────────

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Periodic cleanup to avoid memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now > record.resetTime) rateLimitMap.delete(ip);
  }
}, 60_000);

app.use(express.json({ limit: '100kb' }));

// CORS
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') return void res.sendStatus(200);
  next();
});

// Rate limiting middleware
function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, record);
  }
  record.count++;

  res.header('X-RateLimit-Limit', RATE_LIMIT.toString());
  res.header('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - record.count).toString());
  res.header('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());

  if (record.count > RATE_LIMIT) {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }
  next();
}

app.use(rateLimit);

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ── Helpers ──────────────────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isValidToken(token: string): boolean {
  return /^[A-Z0-9]{1,10}$/.test(token);
}

function interpretSentiment(score: number): SentimentInterpretation {
  if (score >= 60) return 'very_bullish';
  if (score >= 20) return 'bullish';
  if (score >= -20) return 'neutral';
  if (score >= -60) return 'bearish';
  return 'very_bearish';
}

function generateSignal(sentiment: { score: number; confidence: number; volume: number }): TradingSignal {
  const { score, confidence, volume } = sentiment;
  if (confidence < 30 || volume < 3) return 'insufficient_data';
  if (score >= 60 && confidence >= 60) return 'strong_buy';
  if (score >= 30 && confidence >= 40) return 'buy';
  if (score <= -60 && confidence >= 60) return 'strong_sell';
  if (score <= -30 && confidence >= 40) return 'sell';
  return 'hold';
}

function clampInt(val: string | undefined, min: number, max: number, fallback: number): number {
  if (val === undefined) return fallback;
  const n = parseInt(val, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ── Data access ──────────────────────────────────────────────────────

let dataCache: { data: any; timestamp: number } | null = null;

function getLatestData(): any {
  if (dataCache && Date.now() - dataCache.timestamp < CACHE_TTL_MS) return dataCache.data;
  if (!fs.existsSync(DATA_DIR)) return null;

  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('sentiment-') && f.endsWith('.json'))
      .sort().reverse();
    if (files.length === 0) return null;

    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), 'utf-8'));
    dataCache = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error('Error reading sentiment data:', error);
    return null;
  }
}

function getHistoricalData(limit: number = 10): any[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('sentiment-') && f.endsWith('.json'))
      .sort().reverse().slice(0, limit);
    return files.map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')));
  } catch (error) {
    console.error('Error reading historical data:', error);
    return [];
  }
}

function countDataFiles(): number {
  if (!fs.existsSync(DATA_DIR)) return 0;
  try {
    return fs.readdirSync(DATA_DIR).filter(f => f.startsWith('sentiment-') && f.endsWith('.json')).length;
  } catch { return 0; }
}

// ── Routes ───────────────────────────────────────────────────────────

// Health check (enhanced dashboard)
app.get('/health', (_req: Request, res: Response) => {
  const data = getLatestData();
  const now = Date.now();
  let dataAge: number | null = null;
  if (data?.timestamp) {
    dataAge = Math.round((now - new Date(data.timestamp).getTime()) / 1000);
  }

  const health: HealthResponse = {
    status: data ? (dataAge !== null && dataAge < 3600 ? 'ok' : 'degraded') : 'down',
    service: 'solsentinel',
    version: VERSION,
    uptime: Math.round((now - startedAt) / 1000),
    dataAvailable: !!data,
    lastUpdate: data?.timestamp || null,
    dataAge,
    trackedTokens: TRACKED_TOKENS.length,
    dataFiles: countDataFiles(),
    memoryUsage: process.memoryUsage(),
  };
  res.json(health);
});

// Get sentiment for a specific token
app.get('/sentiment/:token', asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token.toUpperCase();

  if (!isValidToken(token)) {
    res.status(400).json({ error: 'Invalid token', message: 'Token must be 1-10 alphanumeric characters' });
    return;
  }

  const data = getLatestData();
  if (!data) {
    res.status(503).json({ error: 'Service unavailable', message: 'No sentiment data available. Crawler may not have run yet.' });
    return;
  }

  const sentiment = data.results[token];
  if (!sentiment) {
    const isTracked = TRACKED_TOKENS.includes(token);
    res.status(404).json({
      error: isTracked ? 'No data' : 'Token not found',
      message: isTracked
        ? `Token ${token} is tracked but has no sentiment data yet`
        : `No data for token ${token}. It may not be tracked.`,
      isTracked,
      hint: isTracked ? undefined : 'Use GET /tokens to see all tracked tokens',
    });
    return;
  }

  const resp: TokenSentimentResponse = {
    token,
    sentiment: sentiment.score,
    confidence: sentiment.confidence,
    volume: sentiment.volume,
    timestamp: data.timestamp,
    interpretation: interpretSentiment(sentiment.score),
    signal: generateSignal(sentiment),
    signals: sentiment.signals,
  };
  res.json(resp);
}));

// Get all sentiment data with filtering & sorting
app.get('/sentiment', asyncHandler(async (req: Request, res: Response) => {
  const category = (req.query.category as string)?.toLowerCase();
  const minVolume = clampInt(req.query.minVolume as string, 0, 100000, 0);
  const minConfidence = clampInt(req.query.minConfidence as string, 0, 100, 0);
  const sortBy = (req.query.sortBy as string) || 'volume';
  const order = (req.query.order as string) || 'desc';
  const limit = clampInt(req.query.limit as string, 1, 200, 200);

  const data = getLatestData();
  if (!data) {
    res.status(503).json({ error: 'Service unavailable', message: 'No sentiment data available.' });
    return;
  }

  let results: TokenSentimentResponse[] = Object.entries(data.results).map(([token, s]: [string, any]) => ({
    token,
    sentiment: s.score,
    confidence: s.confidence,
    volume: s.volume,
    timestamp: data.timestamp,
    interpretation: interpretSentiment(s.score),
    signal: generateSignal(s),
  }));

  // Filters
  if (category && TOKEN_CATEGORIES[category]) {
    const cats = TOKEN_CATEGORIES[category];
    results = results.filter(r => cats.includes(r.token));
  } else if (category && !TOKEN_CATEGORIES[category]) {
    res.status(400).json({ error: 'Invalid category', availableCategories: Object.keys(TOKEN_CATEGORIES) });
    return;
  }
  if (minVolume > 0) results = results.filter(r => r.volume >= minVolume);
  if (minConfidence > 0) results = results.filter(r => r.confidence >= minConfidence);

  // Sort
  const key = sortBy === 'sentiment' ? 'sentiment' : sortBy === 'confidence' ? 'confidence' : 'volume';
  results.sort((a: any, b: any) => {
    const av = key === 'sentiment' ? Math.abs(a[key]) : a[key];
    const bv = key === 'sentiment' ? Math.abs(b[key]) : b[key];
    return order === 'asc' ? av - bv : bv - av;
  });

  results = results.slice(0, limit);

  res.json({ timestamp: data.timestamp, count: results.length, filters: { category, minVolume, minConfidence }, tokens: results });
}));

// Trending tokens
app.get('/trending', asyncHandler(async (req: Request, res: Response) => {
  const limit = clampInt(req.query.limit as string, 1, 50, 10);
  const data = getLatestData();
  if (!data) { res.status(503).json({ error: 'Service unavailable' }); return; }

  const results = Object.entries(data.results)
    .map(([token, s]: [string, any]) => ({
      token,
      sentiment: s.score,
      volume: s.volume,
      confidence: s.confidence,
      trendScore: Math.abs(s.score) * Math.log(s.volume + 1) * (s.confidence / 100),
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
      interpretation: interpretSentiment(t.sentiment),
    })),
  });
}));

// Alerts
app.get('/alerts', asyncHandler(async (req: Request, res: Response) => {
  const severityFilter = req.query.severity as string | undefined;
  if (severityFilter && !['low', 'medium', 'high'].includes(severityFilter)) {
    res.status(400).json({ error: 'Invalid severity', allowed: ['low', 'medium', 'high'] });
    return;
  }

  const data = getLatestData();
  if (!data) { res.status(503).json({ error: 'Service unavailable' }); return; }

  let alerts: SentimentAlert[] = Object.entries(data.results)
    .filter(([, s]: [string, any]) => Math.abs(s.score) > 50 && s.confidence > 50)
    .map(([token, s]: [string, any]) => {
      const severity: AlertSeverity = Math.abs(s.score) > 80 ? 'high' : Math.abs(s.score) > 65 ? 'medium' : 'low';
      return {
        token,
        type: s.score > 50 ? 'bullish_surge' : 'bearish_dump',
        severity,
        sentiment: s.score,
        confidence: s.confidence,
        volume: s.volume,
        message: s.score > 50
          ? `Strong bullish sentiment for ${token} (+${s.score})`
          : `Strong bearish sentiment for ${token} (${s.score})`,
        timestamp: new Date(data.timestamp),
      } as SentimentAlert;
    });

  if (severityFilter) alerts = alerts.filter(a => a.severity === severityFilter);

  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  alerts.sort((a, b) => {
    const d = severityOrder[b.severity] - severityOrder[a.severity];
    return d !== 0 ? d : Math.abs(b.sentiment) - Math.abs(a.sentiment);
  });

  res.json({ timestamp: data.timestamp, alertCount: alerts.length, alerts });
}));

// Token list
app.get('/tokens', (req: Request, res: Response) => {
  const category = (req.query.category as string)?.toLowerCase();
  if (category) {
    if (!TOKEN_CATEGORIES[category]) {
      res.status(400).json({ error: 'Invalid category', availableCategories: Object.keys(TOKEN_CATEGORIES) });
      return;
    }
    res.json({ category, tokens: TOKEN_CATEGORIES[category], count: TOKEN_CATEGORIES[category].length });
    return;
  }
  res.json({ total: TRACKED_TOKENS.length, categories: Object.keys(TOKEN_CATEGORIES), tokens: TRACKED_TOKENS });
});

// Categories
app.get('/categories', (_req: Request, res: Response) => {
  const categories = Object.entries(TOKEN_CATEGORIES).map(([name, tokens]) => ({ name, count: tokens.length, tokens }));
  res.json({ count: categories.length, categories });
});

// Search tokens (new endpoint)
app.get('/search', (req: Request, res: Response) => {
  const q = (req.query.q as string || '').toUpperCase().trim();
  if (!q || q.length < 1) {
    res.status(400).json({ error: 'Missing query', message: 'Provide ?q=<search term>' });
    return;
  }

  const matched = TRACKED_TOKENS.filter(t => t.includes(q));
  const data = getLatestData();

  const results = matched.map(token => {
    const s = data?.results?.[token];
    return {
      token,
      hasData: !!s,
      sentiment: s?.score ?? null,
      confidence: s?.confidence ?? null,
      volume: s?.volume ?? null,
      category: Object.entries(TOKEN_CATEGORIES).find(([, tokens]) => tokens.includes(token))?.[0] ?? null,
    };
  });

  res.json({ query: q, count: results.length, results });
});

// Historical sentiment for a token
app.get('/history/:token', asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token.toUpperCase();
  const limit = clampInt(req.query.limit as string, 1, 200, 24);

  if (!isValidToken(token)) {
    res.status(400).json({ error: 'Invalid token' });
    return;
  }

  const historical = getHistoricalData(limit);
  if (historical.length === 0) {
    res.status(503).json({ error: 'Service unavailable', message: 'No historical data available.' });
    return;
  }

  const history: HistoryPoint[] = historical
    .map(data => {
      const s = data.results[token];
      if (!s) return null;
      return { timestamp: data.timestamp, sentiment: s.score, confidence: s.confidence, volume: s.volume };
    })
    .filter((h): h is HistoryPoint => h !== null)
    .reverse();

  if (history.length === 0) {
    res.status(404).json({ error: 'No history', message: `No historical data for token ${token}` });
    return;
  }

  // Compute simple stats
  const scores = history.map(h => h.sentiment);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  res.json({ token, dataPoints: history.length, stats: { avg, min, max }, history });
}));

// Compare multiple tokens
app.get('/compare', asyncHandler(async (req: Request, res: Response) => {
  const tokensParam = req.query.tokens as string;
  if (!tokensParam) {
    res.status(400).json({ error: 'Missing parameter', message: 'Provide tokens as comma-separated list: ?tokens=SOL,BONK,WIF' });
    return;
  }

  const tokens = tokensParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 10);
  for (const t of tokens) {
    if (!isValidToken(t)) {
      res.status(400).json({ error: 'Invalid token', message: `Invalid token format: ${t}` });
      return;
    }
  }

  const data = getLatestData();
  if (!data) { res.status(503).json({ error: 'Service unavailable' }); return; }

  const comparison: ComparisonEntry[] = tokens.map(token => {
    const s = data.results[token];
    if (!s) return { token, available: false };
    return {
      token, available: true,
      sentiment: s.score, confidence: s.confidence, volume: s.volume,
      interpretation: interpretSentiment(s.score),
    };
  });

  res.json({ timestamp: data.timestamp, comparison });
}));

// Skill spec for other agents
app.get('/skill.md', (_req: Request, res: Response) => {
  res.type('text/markdown').send(`# SolSentinel API v${VERSION}

Crypto Social Sentiment Oracle on Solana.

## Base URL
\`http://localhost:${PORT}\`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health dashboard with uptime & memory |
| GET | /sentiment/:token | Sentiment for one token |
| GET | /sentiment | All sentiment (filterable) |
| GET | /trending?limit=10 | Trending tokens |
| GET | /alerts?severity=high | Sentiment alerts |
| GET | /tokens?category=memecoin | Tracked token list |
| GET | /categories | Token categories |
| GET | /search?q=BON | Search tokens |
| GET | /history/:token?limit=24 | Historical sentiment + stats |
| GET | /compare?tokens=SOL,BONK | Compare tokens side-by-side |
| WS  | ws://localhost:${PORT}/ws | Real-time sentiment stream |

## WebSocket
Connect to \`/ws\`, send JSON:
\`\`\`json
{"type":"subscribe","tokens":["SOL","BONK"]}
{"type":"unsubscribe","tokens":["SOL"]}
{"type":"ping"}
\`\`\`

## Rate Limits
${RATE_LIMIT} requests/minute per IP. Headers: X-RateLimit-{Limit,Remaining,Reset}.

Built by Noop (@smart_noop).
`);
});

// 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    hint: 'GET /health or GET /skill.md',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ── WebSocket server ─────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

interface WSClient {
  ws: WebSocket;
  subscriptions: Set<string>;
}

const wsClients = new Map<WebSocket, WSClient>();

wss.on('connection', (ws: WebSocket) => {
  const client: WSClient = { ws, subscriptions: new Set() };
  wsClients.set(ws, client);
  console.log(`WS client connected (total: ${wsClients.size})`);

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());

      if (msg.type === 'ping') {
        sendWS(ws, { type: 'pong', timestamp: new Date().toISOString() });
        return;
      }

      if (msg.type === 'subscribe' && Array.isArray(msg.tokens)) {
        const tokens = msg.tokens.map(t => t.toUpperCase()).filter(isValidToken).slice(0, 50);
        for (const t of tokens) client.subscriptions.add(t);
        sendWS(ws, { type: 'subscribed', data: { tokens: [...client.subscriptions] }, timestamp: new Date().toISOString() });
        return;
      }

      if (msg.type === 'unsubscribe' && Array.isArray(msg.tokens)) {
        for (const t of msg.tokens) client.subscriptions.delete(t.toUpperCase());
        sendWS(ws, { type: 'unsubscribed', data: { tokens: [...client.subscriptions] }, timestamp: new Date().toISOString() });
        return;
      }

      sendWS(ws, { type: 'error', data: { message: 'Unknown message type' }, timestamp: new Date().toISOString() });
    } catch {
      sendWS(ws, { type: 'error', data: { message: 'Invalid JSON' }, timestamp: new Date().toISOString() });
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`WS client disconnected (total: ${wsClients.size})`);
  });
});

function sendWS(ws: WebSocket, msg: WSServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** Broadcast sentiment updates to subscribed WS clients */
function broadcastSentimentUpdate(token: string, data: any): void {
  const msg: WSServerMessage = {
    type: 'sentiment_update',
    data: { token, ...data },
    timestamp: new Date().toISOString(),
  };
  const payload = JSON.stringify(msg);

  for (const client of wsClients.values()) {
    if (client.subscriptions.has(token) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

// Periodic broadcast of latest data to WS subscribers (every 30s)
let lastBroadcastTimestamp: string | null = null;

setInterval(() => {
  const data = getLatestData();
  if (!data || data.timestamp === lastBroadcastTimestamp) return;
  lastBroadcastTimestamp = data.timestamp;

  for (const [token, sentiment] of Object.entries(data.results) as [string, any][]) {
    broadcastSentimentUpdate(token, {
      sentiment: sentiment.score,
      confidence: sentiment.confidence,
      volume: sentiment.volume,
      interpretation: interpretSentiment(sentiment.score),
    });
  }
}, 30_000);

// ── Start ────────────────────────────────────────────────────────────

const isMain = require.main === module ||
  process.argv[1]?.endsWith('api.ts') ||
  !process.argv[1];

if (isMain) {
  server.listen(PORT, () => {
    console.log(`🔮 SolSentinel API v${VERSION} running on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /health           - Health dashboard`);
    console.log(`  GET  /sentiment/:token  - Token sentiment`);
    console.log(`  GET  /sentiment         - All sentiment`);
    console.log(`  GET  /trending          - Trending tokens`);
    console.log(`  GET  /alerts            - Sentiment alerts`);
    console.log(`  GET  /tokens            - Tracked tokens`);
    console.log(`  GET  /categories        - Token categories`);
    console.log(`  GET  /search?q=         - Search tokens`);
    console.log(`  GET  /history/:token    - Historical data`);
    console.log(`  GET  /compare           - Compare tokens`);
    console.log(`  GET  /skill.md          - API spec`);
    console.log(`  WS   /ws               - Real-time stream`);
  });
}

export { app, server, broadcastSentimentUpdate };
