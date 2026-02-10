#!/usr/bin/env ts-node
/**
 * SolSentinel Demo Script
 * Shows the full flow: generate data → analyze → upload → query API
 * 
 * Usage: npm run demo
 */

import { SentimentAnalyzer } from '../src/analyzer';
import { generateMockData } from '../src/mockData';
import { Tweet, TRACKED_TOKENS } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';

const DATA_DIR = '/root/.openclaw/workspace/solsentinel/data';

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(body); }
      });
    }).on('error', reject);
  });
}

function banner(text: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

// ─── Step 1: Crawl (simulated with mock tweets) ───────────────────────────

async function stepCrawl(): Promise<Tweet[]> {
  banner('🐦 STEP 1: Crawl Twitter (simulated)');
  
  const sampleTexts = [
    { text: '$SOL breaking out! This pump is just getting started 🚀🚀🚀 bullish af', author: 'sol_maxi', followers: 85000 },
    { text: '$SOL staking rewards are insane rn, accumulate while you can 💎', author: 'defi_chad', followers: 42000 },
    { text: 'Just aped $BONK with my whole portfolio. wagmi frens 🔥 to the moon', author: 'bonk_degen', followers: 15000 },
    { text: '$BONK is dead, ngmi. Exit while you can 💀📉', author: 'bear_whale', followers: 120000 },
    { text: '$JUP airdrop was a scam, devs dumping on us. bearish dump incoming', author: 'skeptic99', followers: 95000 },
    { text: '$JUP V2 launch looking amazing! This will moon, buy the dip 📈', author: 'jup_fan', followers: 30000 },
    { text: '$WIF is the best memecoin on Solana. pump incoming, lfg! 🐶', author: 'wif_holder', followers: 25000 },
    { text: '$WIF overvalued garbage, another rug pull waiting to happen', author: 'crypto_realist', followers: 60000 },
    { text: '$AI16Z and $ZEREBRO leading the AI agent revolution on Solana! undervalued gem 💎', author: 'ai_alpha', followers: 50000 },
    { text: '$RAY V3 is a game changer for Solana DeFi. Bullish long term hodl', author: 'raydium_user', followers: 18000 },
    { text: '$POPCAT going to zero, sell everything, crash incoming 🔻', author: 'popcat_hater', followers: 8000 },
    { text: '$MYRO pump is real! Just broke ATH, send it 🚀 moon', author: 'myro_army', followers: 35000 },
    { text: 'Bearish on $ETH, moving everything to $SOL. The flippening is real', author: 'eth_refugee', followers: 70000 },
    { text: '$DRIFT protocol tvl exploding. Top Solana defi play, accumulate', author: 'drift_whale', followers: 45000 },
    { text: '$JITO liquid staking is the future. Bullish breakout pattern 📈', author: 'jito_bull', followers: 22000 },
  ];

  const tweets: Tweet[] = sampleTexts.map((t, i) => ({
    id: `demo_${Date.now()}_${i}`,
    text: t.text,
    author: t.author,
    authorFollowers: t.followers,
    timestamp: new Date(),
    likes: Math.floor(Math.random() * 2000),
    retweets: Math.floor(Math.random() * 500),
    replies: Math.floor(Math.random() * 200),
    tokens: [],
  }));

  console.log(`\n  Collected ${tweets.length} tweets mentioning crypto tokens`);
  for (const t of tweets.slice(0, 5)) {
    console.log(`    @${t.author}: "${t.text.slice(0, 60)}..."`);
  }
  console.log(`    ... and ${tweets.length - 5} more\n`);
  
  return tweets;
}

// ─── Step 2: Analyze sentiment ────────────────────────────────────────────

async function stepAnalyze(tweets: Tweet[]) {
  banner('📊 STEP 2: Analyze Sentiment');
  
  const analyzer = new SentimentAnalyzer();
  const results = analyzer.processTweets(tweets);
  
  console.log(`\n  Analyzed ${tweets.length} tweets across ${results.size} tokens:\n`);
  
  const sorted = [...results.entries()].sort((a, b) => b[1].volume - a[1].volume);
  for (const [token, s] of sorted) {
    const emoji = s.score > 20 ? '🟢' : s.score < -20 ? '🔴' : '🟡';
    const bar = s.score > 0 ? '█'.repeat(Math.min(s.score / 5, 20)) : '░'.repeat(Math.min(Math.abs(s.score) / 5, 20));
    console.log(`    ${emoji} ${token.padEnd(8)} ${String(s.score > 0 ? '+' + s.score : s.score).padStart(5)}  conf:${String(s.confidence + '%').padStart(5)}  vol:${s.volume}  ${bar}`);
  }
  
  // Save to data dir
  const resultsObj: Record<string, any> = {};
  for (const [token, s] of results) {
    resultsObj[token] = { ...s, timestamp: s.timestamp.toISOString() };
  }
  
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(DATA_DIR, `sentiment-${ts}.json`);
  fs.writeFileSync(filename, JSON.stringify({ timestamp: new Date().toISOString(), results: resultsObj, mock: false, demo: true }, null, 2));
  console.log(`\n  💾 Saved to ${path.basename(filename)}`);
  
  return results;
}

// ─── Step 3: Upload to Solana (dry run) ───────────────────────────────────

async function stepUpload(results: Map<string, any>) {
  banner('⛓️  STEP 3: Upload to Solana (dry run)');
  
  const hasWallet = fs.existsSync(process.env.SOLANA_WALLET || (process.env.HOME + '/.config/solana/id.json'));
  
  if (!hasWallet) {
    console.log('\n  ⚠️  No Solana wallet found — showing dry run\n');
    console.log('  To upload for real:');
    console.log('    1. solana-keygen new');
    console.log('    2. solana airdrop 2 --url devnet');
    console.log('    3. npm run upload\n');
  }
  
  const top5 = [...results.entries()]
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, 5);
  
  console.log('  Tokens that would be uploaded:\n');
  for (const [token, s] of top5) {
    const emoji = s.score > 20 ? '🟢' : s.score < -20 ? '🔴' : '🟡';
    console.log(`    ${emoji} ${token}: score=${s.score}, confidence=${s.confidence}%`);
    console.log(`       → PDA: [sentiment, "${token}"] on program HFkh...jVgm`);
  }
  
  if (hasWallet) {
    console.log('\n  🔑 Wallet found! Run `npm run upload` to push on-chain.');
  }
}

// ─── Step 4: Query API ────────────────────────────────────────────────────

async function stepQuery() {
  banner('🔌 STEP 4: Query the API');
  
  // Try to connect to API
  const port = process.env.PORT || 3000;
  try {
    const health = await httpGet(`http://localhost:${port}/health`);
    console.log(`\n  ✅ API is running on port ${port}\n`);
    
    // Query SOL sentiment
    console.log('  GET /sentiment/SOL:');
    try {
      const sol = await httpGet(`http://localhost:${port}/sentiment/SOL`);
      console.log(`    ${JSON.stringify(sol, null, 2).split('\n').join('\n    ')}`);
    } catch { console.log('    (no data for SOL)'); }
    
    // Query trending
    console.log('\n  GET /trending?limit=3:');
    try {
      const trending = await httpGet(`http://localhost:${port}/trending?limit=3`);
      for (const t of (trending.trending || []).slice(0, 3)) {
        console.log(`    ${t.token}: sentiment=${t.sentiment}, vol=${t.volume} (${t.interpretation})`);
      }
    } catch { console.log('    (no trending data)'); }
    
  } catch {
    console.log(`\n  ⚠️  API not running on port ${port}`);
    console.log('  Start it with: npm run api');
    console.log('  Then re-run this demo to see live queries.\n');
    
    // Show what the queries would look like
    console.log('  Example queries you can run:\n');
    console.log(`    curl http://localhost:${port}/health`);
    console.log(`    curl http://localhost:${port}/sentiment/SOL`);
    console.log(`    curl http://localhost:${port}/trending?limit=5`);
    console.log(`    curl "http://localhost:${port}/compare?tokens=SOL,BONK,WIF"`);
    console.log(`    curl http://localhost:${port}/sentiment/SOL/history  # (via /history/SOL)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║  🔮 SolSentinel Demo — Full Flow                ║
  ║  Crawl → Analyze → Upload → Query               ║
  ╚══════════════════════════════════════════════════╝`);

  const tweets = await stepCrawl();
  await sleep(500);
  
  const results = await stepAnalyze(tweets);
  await sleep(500);
  
  await stepUpload(results);
  await sleep(500);
  
  await stepQuery();
  
  banner('✅ Demo Complete!');
  console.log(`
  Next steps:
    • npm run api        — Start the REST API server
    • npm run mock       — Generate more test data
    • npm run upload     — Push sentiment on-chain (needs wallet)
    • npm run crawl      — Run the real Twitter crawler
  
  Program: HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm (devnet)
  Docs:    GET /skill.md on the API server
  `);
}

main().catch(console.error);
