// Core types for SolSentinel

export interface Tweet {
  id: string;
  text: string;
  author: string;
  authorFollowers: number;
  timestamp: Date;
  likes: number;
  retweets: number;
  replies: number;
  tokens: string[];  // Detected token symbols
}

export interface SentimentScore {
  token: string;
  score: number;        // -100 (bearish) to +100 (bullish)
  confidence: number;   // 0-100
  volume: number;       // Number of mentions
  timestamp: Date;
  sources: string[];    // Tweet IDs
}

export interface TrendingToken {
  symbol: string;
  mentions: number;
  sentimentScore: number;
  changePercent: number;  // vs previous period
  topTweets: string[];
}

export interface SentimentAlert {
  token: string;
  type: 'surge' | 'dump' | 'reversal' | 'whale_activity';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: Date;
}

// Solana on-chain types
export interface OnChainSentiment {
  token: string;
  score: number;
  confidence: number;
  volume: number;
  timestamp: number;  // Unix timestamp
  authority: string;  // Pubkey of updater
}

// Keywords for sentiment analysis
export const BULLISH_KEYWORDS = [
  'bullish', 'moon', 'pump', 'buy', 'long', 'breakout', 'ath',
  'gem', 'undervalued', 'accumulate', 'hodl', 'wagmi', 'gm',
  'lfg', 'send it', 'to the moon', '🚀', '📈', '💎', '🔥'
];

export const BEARISH_KEYWORDS = [
  'bearish', 'dump', 'sell', 'short', 'crash', 'rug', 'scam',
  'overvalued', 'dead', 'ngmi', 'rekt', 'exit', 'top signal',
  'bubble', 'ponzi', '📉', '💀', '🔻'
];

// Common Solana token symbols to track
export const TRACKED_TOKENS = [
  'SOL', 'BONK', 'WIF', 'JUP', 'JTO', 'PYTH', 'RAY', 'ORCA',
  'MNDE', 'SAMO', 'BOME', 'POPCAT', 'MEW', 'MYRO', 'SLERF',
  'FWOG', 'GOAT', 'AI16Z', 'GRIFFAIN', 'ZEREBRO'
];
