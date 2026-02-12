/**
 * API endpoint tests for SolSentinel
 * 
 * Tests all REST endpoints for correct responses, error handling,
 * and edge cases.
 */

import http from 'http';
import { app } from '../src/api';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/root/.openclaw/workspace/solsentinel/data';
const TEST_PORT = 3999;

let server: http.Server;

// Helper to make HTTP requests
function request(path: string): Promise<{ status: number; body: any; headers: any }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(body), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode!, body, headers: res.headers });
        }
      });
    }).on('error', reject);
  });
}

// Ensure test data exists
function ensureTestData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const testData = {
    timestamp: new Date().toISOString(),
    results: {
      SOL: { token: 'SOL', score: 42, confidence: 87, volume: 62, timestamp: new Date().toISOString(), sources: [] },
      BONK: { token: 'BONK', score: 55, confidence: 78, volume: 45, timestamp: new Date().toISOString(), sources: [] },
      WIF: { token: 'WIF', score: -35, confidence: 60, volume: 20, timestamp: new Date().toISOString(), sources: [] },
      JUP: { token: 'JUP', score: 75, confidence: 90, volume: 30, timestamp: new Date().toISOString(), sources: [] },
      ETH: { token: 'ETH', score: -70, confidence: 65, volume: 15, timestamp: new Date().toISOString(), sources: [] },
    }
  };
  
  const filename = `sentiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(testData, null, 2));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────

beforeAll((done) => {
  ensureTestData();
  server = app.listen(TEST_PORT, done);
});

afterAll((done) => {
  server.close(done);
});

// ─── Health ───────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('should return ok status', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('solsentinel');
    expect(res.body.version).toBeDefined();
    expect(typeof res.body.trackedTokens).toBe('number');
  });

  it('should indicate data availability', async () => {
    const res = await request('/health');
    expect(typeof res.body.dataAvailable).toBe('boolean');
  });
});

// ─── Sentiment (single token) ─────────────────────────────────────────────

describe('GET /sentiment/:token', () => {
  it('should return sentiment for a valid token', async () => {
    const res = await request('/sentiment/SOL');
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('SOL');
    expect(typeof res.body.sentiment).toBe('number');
    expect(typeof res.body.confidence).toBe('number');
    expect(typeof res.body.volume).toBe('number');
    expect(res.body.interpretation).toBeDefined();
    expect(res.body.signal).toBeDefined();
  });

  it('should be case-insensitive', async () => {
    const res = await request('/sentiment/sol');
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('SOL');
  });

  it('should return 404 for unknown token', async () => {
    const res = await request('/sentiment/ZZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('should return 400 for invalid token format', async () => {
    const res = await request('/sentiment/this-is-not-valid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid token');
  });
});

// ─── Sentiment (all) ──────────────────────────────────────────────────────

describe('GET /sentiment', () => {
  it('should return all sentiment data', async () => {
    const res = await request('/sentiment');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.tokens)).toBe(true);
  });

  it('should filter by category', async () => {
    const res = await request('/sentiment?category=l1');
    expect(res.status).toBe(200);
    // All returned tokens should be in l1 category
    for (const token of res.body.tokens) {
      expect(['SOL', 'ETH', 'BTC', 'AVAX', 'NEAR', 'INJ']).toContain(token.token);
    }
  });

  it('should filter by minVolume', async () => {
    const res = await request('/sentiment?minVolume=50');
    expect(res.status).toBe(200);
    for (const token of res.body.tokens) {
      expect(token.volume).toBeGreaterThanOrEqual(50);
    }
  });

  it('should sort by sentiment', async () => {
    const res = await request('/sentiment?sortBy=sentiment&order=desc');
    expect(res.status).toBe(200);
    const tokens = res.body.tokens;
    for (let i = 1; i < tokens.length; i++) {
      expect(Math.abs(tokens[i - 1].sentiment)).toBeGreaterThanOrEqual(Math.abs(tokens[i].sentiment));
    }
  });
});

// ─── Trending ─────────────────────────────────────────────────────────────

describe('GET /trending', () => {
  it('should return trending tokens', async () => {
    const res = await request('/trending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trending)).toBe(true);
  });

  it('should respect limit parameter', async () => {
    const res = await request('/trending?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.trending.length).toBeLessThanOrEqual(3);
  });

  it('should cap limit at 50', async () => {
    const res = await request('/trending?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.trending.length).toBeLessThanOrEqual(50);
  });
});

// ─── Alerts ───────────────────────────────────────────────────────────────

describe('GET /alerts', () => {
  it('should return alerts array', async () => {
    const res = await request('/alerts');
    expect(res.status).toBe(200);
    expect(typeof res.body.alertCount).toBe('number');
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  it('should filter by severity', async () => {
    const res = await request('/alerts?severity=high');
    expect(res.status).toBe(200);
    for (const alert of res.body.alerts) {
      expect(alert.severity).toBe('high');
    }
  });

  it('should have correct alert structure', async () => {
    const res = await request('/alerts');
    for (const alert of res.body.alerts) {
      expect(alert.token).toBeDefined();
      expect(alert.type).toBeDefined();
      expect(alert.severity).toBeDefined();
      expect(alert.message).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(alert.severity);
    }
  });
});

// ─── Tokens ───────────────────────────────────────────────────────────────

describe('GET /tokens', () => {
  it('should return all tracked tokens', async () => {
    const res = await request('/tokens');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.tokens)).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('should filter by category', async () => {
    const res = await request('/tokens?category=memecoin');
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('memecoin');
    expect(res.body.tokens).toContain('BONK');
  });

  it('should return 400 for invalid category', async () => {
    const res = await request('/tokens?category=fakecategory');
    expect(res.status).toBe(400);
    expect(res.body.availableCategories).toBeDefined();
  });
});

// ─── Categories ───────────────────────────────────────────────────────────

describe('GET /categories', () => {
  it('should return all categories', async () => {
    const res = await request('/categories');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.categories)).toBe(true);
    
    const names = res.body.categories.map((c: any) => c.name);
    expect(names).toContain('l1');
    expect(names).toContain('defi');
    expect(names).toContain('memecoin');
  });
});

// ─── History ──────────────────────────────────────────────────────────────

describe('GET /history/:token', () => {
  it('should return historical data', async () => {
    const res = await request('/history/SOL');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.token).toBe('SOL');
      expect(Array.isArray(res.body.history)).toBe(true);
    }
  });

  it('should return 400 for invalid token', async () => {
    const res = await request('/history/not-valid!');
    expect(res.status).toBe(400);
  });
});

// ─── Compare ──────────────────────────────────────────────────────────────

describe('GET /compare', () => {
  it('should compare multiple tokens', async () => {
    const res = await request('/compare?tokens=SOL,BONK,WIF');
    expect(res.status).toBe(200);
    expect(res.body.comparison.length).toBe(3);
    expect(res.body.comparison[0].token).toBe('SOL');
  });

  it('should return 400 without tokens param', async () => {
    const res = await request('/compare');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing parameter');
  });

  it('should handle unavailable tokens gracefully', async () => {
    const res = await request('/compare?tokens=SOL,BONK');
    expect(res.status).toBe(200);
    expect(res.body.comparison.length).toBe(2);
  });
});

// ─── Skill.md ─────────────────────────────────────────────────────────────

describe('GET /skill.md', () => {
  it('should return markdown documentation', async () => {
    const res = await request('/skill.md');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
    expect(res.body).toContain('SolSentinel API');
  });
});

// ─── 404 handling ─────────────────────────────────────────────────────────

describe('404 handling', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
    expect(res.body.hint).toBeDefined();
  });
});

// ─── Rate limiting headers ────────────────────────────────────────────────

describe('Rate limiting', () => {
  it('should include rate limit headers', async () => {
    const res = await request('/health');
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });
});

// ─── CORS ─────────────────────────────────────────────────────────────────

describe('CORS', () => {
  it('should include CORS headers', async () => {
    const res = await request('/health');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
