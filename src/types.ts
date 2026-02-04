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
// Categories: L1, DeFi, Memecoins, AI Agents, NFT tokens
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
  'stablecoin': ['USDC', 'USDT', 'DAI', 'FRAX', 'USDH']
};
