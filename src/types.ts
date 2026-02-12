// Core types for SolSentinel

// ── Tweet & Social Data ──────────────────────────────────────────────

export interface Tweet {
  id: string;
  text: string;
  author: string;
  authorFollowers: number;
  timestamp: Date;
  likes: number;
  retweets: number;
  replies: number;
  tokens: string[];          // Detected token symbols
  quotedText?: string;       // Quoted tweet text (if any)
  isReply?: boolean;
  platform?: 'twitter' | 'discord' | 'telegram' | 'reddit';
}

// ── Sentiment Scores ─────────────────────────────────────────────────

export interface SentimentScore {
  token: string;
  score: number;             // -100 (bearish) to +100 (bullish)
  confidence: number;        // 0-100
  volume: number;            // Number of mentions
  timestamp: Date;
  sources: string[];         // Tweet IDs
  signals?: SentimentSignals;
}

/** Breakdown of individual signal contributions */
export interface SentimentSignals {
  keywordScore: number;
  engagementScore: number;
  followerWeight: number;
  emojiScore: number;
  negationAdjustment: number;
  momentumScore: number;
  viralityBonus: number;
}

export type SentimentInterpretation =
  | 'very_bullish'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'very_bearish';

export type TradingSignal =
  | 'strong_buy'
  | 'buy'
  | 'hold'
  | 'sell'
  | 'strong_sell'
  | 'insufficient_data';

// ── Trending & Alerts ────────────────────────────────────────────────

export interface TrendingToken {
  symbol: string;
  mentions: number;
  sentimentScore: number;
  changePercent: number;     // vs previous period
  topTweets: string[];
}

export type AlertType = 'surge' | 'dump' | 'reversal' | 'whale_activity' | 'bullish_surge' | 'bearish_dump';
export type AlertSeverity = 'low' | 'medium' | 'high';

export interface SentimentAlert {
  token: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  sentiment: number;
  confidence: number;
  volume: number;
}

// ── On-chain ─────────────────────────────────────────────────────────

export interface OnChainSentiment {
  token: string;
  score: number;
  confidence: number;
  volume: number;
  timestamp: number;         // Unix timestamp
  authority: string;         // Pubkey of updater
}

// ── API Request / Response types ─────────────────────────────────────

export interface SentimentQuery {
  category?: string;
  minVolume?: number;
  minConfidence?: number;
  sortBy?: 'volume' | 'sentiment' | 'confidence';
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface TokenSentimentResponse {
  token: string;
  sentiment: number;
  confidence: number;
  volume: number;
  timestamp: string;
  interpretation: SentimentInterpretation;
  signal: TradingSignal;
  signals?: SentimentSignals;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  uptime: number;
  dataAvailable: boolean;
  lastUpdate: string | null;
  dataAge: number | null;       // seconds since last update
  trackedTokens: number;
  dataFiles: number;
  memoryUsage: NodeJS.MemoryUsage;
}

export interface HistoryPoint {
  timestamp: string;
  sentiment: number;
  confidence: number;
  volume: number;
}

export interface ComparisonEntry {
  token: string;
  available: boolean;
  sentiment?: number;
  confidence?: number;
  volume?: number;
  interpretation?: SentimentInterpretation;
}

// ── WebSocket ────────────────────────────────────────────────────────

export type WSMessageType = 'subscribe' | 'unsubscribe' | 'ping';
export type WSEventType = 'sentiment_update' | 'alert' | 'pong' | 'error' | 'subscribed' | 'unsubscribed';

export interface WSClientMessage {
  type: WSMessageType;
  tokens?: string[];
}

export interface WSServerMessage {
  type: WSEventType;
  data?: unknown;
  timestamp: string;
}

// ── Keyword dictionaries ─────────────────────────────────────────────

export const BULLISH_KEYWORDS = [
  'bullish', 'moon', 'pump', 'buy', 'long', 'breakout', 'ath',
  'gem', 'undervalued', 'accumulate', 'hodl', 'wagmi', 'gm',
  'lfg', 'send it', 'to the moon', 'parabolic', 'alpha', 'dyor',
  'early', 'sleeping on', 'next leg up', 'higher low',
  '🚀', '📈', '💎', '🔥', '💰', '🤑', '🏆', '✅', '💪', '🌕'
];

export const BEARISH_KEYWORDS = [
  'bearish', 'dump', 'sell', 'short', 'crash', 'rug', 'scam',
  'overvalued', 'dead', 'ngmi', 'rekt', 'exit', 'top signal',
  'bubble', 'ponzi', 'bagholding', 'capitulate', 'lower high',
  'dead cat bounce', 'exit liquidity', 'fade',
  '📉', '💀', '🔻', '🩸', '⚠️', '🚩', '☠️', '🗑️'
];

/** Words that negate the sentiment of what follows */
export const NEGATION_WORDS = [
  'not', "don't", "doesn't", "didn't", "won't", "can't", "isn't",
  'never', 'no', 'hardly', 'barely', 'neither', 'nor', "wouldn't",
  'stop', 'fake', 'doubt', 'unlikely'
];

/** High-conviction phrases that deserve extra weight */
export const HIGH_CONVICTION_BULLISH = [
  'all in', 'max long', 'generational buy', 'life changing',
  'just bought more', 'adding to my position', 'conviction play'
];

export const HIGH_CONVICTION_BEARISH = [
  'just sold everything', 'getting out', 'this is going to zero',
  'complete scam', 'biggest rug', 'exit all positions'
];

// ── Token tracking ───────────────────────────────────────────────────

// Common Solana token symbols to track
export const TRACKED_TOKENS = [
  // L1 & Major
  'SOL', 'JTO', 'JUP', 'PYTH', 'HNT', 'RENDER', 'INJ', 'MATIC',
  // DeFi
  'RAY', 'ORCA', 'MNDE', 'MARINADE', 'DRIFT', 'KAMINO', 'JITO', 'BLZE',
  'SRM', 'STEP', 'TULIP', 'SABER', 'PORT', 'UXDC',
  // Memecoins & Community
  'BONK', 'WIF', 'SAMO', 'BOME', 'POPCAT', 'MEW', 'MYRO', 'SLERF',
  'FWOG', 'GOAT', 'PONKE', 'WEN', 'BOOK', 'MUMU', 'TREMP', 'BODEN',
  'PENG', 'SLOTH', 'HARAMBE', 'CHEEMS', 'COPE', 'GUMMY',
  // AI Agents & AI Coins
  'AI16Z', 'GRIFFAIN', 'ZEREBRO', 'ELIZAOS', 'ARC', 'SWARMS',
  'VIRTUAL', 'AIXBT', 'TAO', 'FET', 'AGIX', 'OCEAN', 'AKT',
  'NEAR', 'GRASS', 'RENDER', 'RNDR',
  // NFT & Gaming tokens
  'DUST', 'FORGE', 'CROWN', 'GMT', 'GST', 'ATLAS', 'POLIS',
  // Stablecoins (for tracking de-peg sentiment)
  'USDC', 'USDT', 'DAI', 'FRAX', 'USDH',
  // Cross-chain & Others
  'ETH', 'BTC', 'WBTC', 'WETH', 'LDO', 'ARB', 'OP', 'AVAX'
];

// Token categories for filtering
export const TOKEN_CATEGORIES: Record<string, string[]> = {
  'l1': ['SOL', 'ETH', 'BTC', 'AVAX', 'NEAR', 'INJ'],
  'defi': ['RAY', 'ORCA', 'MNDE', 'DRIFT', 'KAMINO', 'JITO', 'JUP', 'BLZE'],
  'memecoin': ['BONK', 'WIF', 'SAMO', 'BOME', 'POPCAT', 'MEW', 'MYRO', 'SLERF', 'FWOG', 'GOAT', 'PONKE', 'WEN'],
  'ai': ['AI16Z', 'GRIFFAIN', 'ZEREBRO', 'ELIZAOS', 'ARC', 'VIRTUAL', 'TAO', 'FET', 'AGIX'],
  'stablecoin': ['USDC', 'USDT', 'DAI', 'FRAX', 'USDH'],
  'gaming': ['GMT', 'GST', 'ATLAS', 'POLIS', 'DUST'],
};
