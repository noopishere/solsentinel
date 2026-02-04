// Mock data generator for testing SolSentinel
// Use when Twitter crawler isn't available

import * as fs from 'fs';
import * as path from 'path';
import { TRACKED_TOKENS, TOKEN_CATEGORIES } from './types';

const DATA_DIR = '/root/.openclaw/workspace/solsentinel/data';

interface MockSentiment {
  token: string;
  score: number;
  confidence: number;
  volume: number;
  timestamp: string;
  sources: string[];
}

/**
 * Generate realistic-looking sentiment scores
 */
function generateMockSentiment(token: string): MockSentiment {
  // Different tokens have different baseline sentiments
  let baseSentiment = 0;
  
  // Memecoins tend to be more volatile
  if (TOKEN_CATEGORIES.memecoin.includes(token)) {
    baseSentiment = Math.random() > 0.5 ? 40 : -30;
  }
  // AI tokens trending bullish
  else if (TOKEN_CATEGORIES.ai.includes(token)) {
    baseSentiment = 30;
  }
  // L1s more stable
  else if (TOKEN_CATEGORIES.l1.includes(token)) {
    baseSentiment = 10;
  }
  // Stablecoins neutral unless depeg
  else if (TOKEN_CATEGORIES.stablecoin.includes(token)) {
    baseSentiment = Math.random() > 0.95 ? -50 : 0;
  }
  
  // Add noise
  const noise = (Math.random() - 0.5) * 60;
  const score = Math.max(-100, Math.min(100, Math.round(baseSentiment + noise)));
  
  // Volume based on token popularity
  const popularTokens = ['SOL', 'BTC', 'ETH', 'BONK', 'WIF', 'JUP'];
  const baseVolume = popularTokens.includes(token) ? 50 : 10;
  const volume = Math.floor(baseVolume + Math.random() * baseVolume);
  
  // Confidence based on volume and keyword matches
  const confidence = Math.min(100, Math.floor(30 + Math.random() * 50 + volume * 0.5));
  
  // Generate fake tweet IDs
  const sources = Array.from({ length: volume }, () => 
    Math.floor(Math.random() * 9000000000000000000).toString()
  );
  
  return {
    token,
    score,
    confidence,
    volume,
    timestamp: new Date().toISOString(),
    sources
  };
}

/**
 * Generate and save mock sentiment data
 */
export function generateMockData(tokens?: string[]): void {
  const tokensToGenerate = tokens || TRACKED_TOKENS.slice(0, 30);
  
  const results: Record<string, MockSentiment> = {};
  
  for (const token of tokensToGenerate) {
    // 80% chance to have data for each token
    if (Math.random() < 0.8) {
      results[token] = generateMockSentiment(token);
    }
  }
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(DATA_DIR, `sentiment-${timestamp}.json`);
  
  const data = {
    timestamp: new Date().toISOString(),
    results,
    mock: true
  };
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`✅ Generated mock data: ${filename}`);
  console.log(`   Tokens: ${Object.keys(results).length}`);
}

/**
 * Generate historical mock data
 */
export function generateHistoricalMockData(hours: number = 24): void {
  const now = Date.now();
  
  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now - i * 60 * 60 * 1000);
    const tokensToGenerate = TRACKED_TOKENS.slice(0, 20);
    
    const results: Record<string, MockSentiment> = {};
    
    for (const token of tokensToGenerate) {
      if (Math.random() < 0.7) {
        const sentiment = generateMockSentiment(token);
        sentiment.timestamp = timestamp.toISOString();
        results[token] = sentiment;
      }
    }
    
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    const ts = timestamp.toISOString().replace(/[:.]/g, '-');
    const filename = path.join(DATA_DIR, `sentiment-${ts}.json`);
    
    const data = {
      timestamp: timestamp.toISOString(),
      results,
      mock: true
    };
    
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  }
  
  console.log(`✅ Generated ${hours + 1} hours of mock historical data`);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--historical')) {
    const hours = parseInt(args[args.indexOf('--historical') + 1]) || 24;
    generateHistoricalMockData(hours);
  } else {
    generateMockData();
  }
}
