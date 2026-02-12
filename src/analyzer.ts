// Sentiment Analysis Engine for SolSentinel
// Multi-signal analysis with negation detection, emoji weighting, momentum, and virality

import {
  Tweet,
  SentimentScore,
  SentimentSignals,
  TrendingToken,
  BULLISH_KEYWORDS,
  BEARISH_KEYWORDS,
  NEGATION_WORDS,
  HIGH_CONVICTION_BULLISH,
  HIGH_CONVICTION_BEARISH,
  TRACKED_TOKENS,
} from './types';

/** Window size (in words) to check for negation before a keyword */
const NEGATION_WINDOW = 3;

export class SentimentAnalyzer {
  private tweetCache: Map<string, Tweet[]> = new Map();
  private sentimentHistory: Map<string, SentimentScore[]> = new Map();

  // ── Token extraction ─────────────────────────────────────────────

  /** Extract token symbols from tweet text */
  extractTokens(text: string): string[] {
    const tokens: string[] = [];
    const upperText = text.toUpperCase();

    // $SYMBOL cashtag format
    const cashtagRegex = /\$([A-Z]{2,10})/g;
    let match: RegExpExecArray | null;
    while ((match = cashtagRegex.exec(upperText)) !== null) {
      tokens.push(match[1]);
    }

    // Tracked tokens mentioned without $
    for (const token of TRACKED_TOKENS) {
      if (upperText.includes(token) && !tokens.includes(token)) {
        // Avoid false matches for short tokens inside larger words
        const re = new RegExp(`\\b${token}\\b`, 'i');
        if (re.test(text)) {
          tokens.push(token);
        }
      }
    }

    return [...new Set(tokens)];
  }

  // ── Single-tweet analysis ────────────────────────────────────────

  /**
   * Check whether a keyword hit at `position` is preceded by a negation word.
   * `words` is the lowercased word array of the tweet.
   */
  private isNegated(words: string[], position: number): boolean {
    const start = Math.max(0, position - NEGATION_WINDOW);
    for (let i = start; i < position; i++) {
      if (NEGATION_WORDS.includes(words[i])) return true;
    }
    return false;
  }

  /** Score a single tweet, returning a breakdown of signals */
  analyzeTweet(tweet: Tweet): { score: number; confidence: number; signals: SentimentSignals } {
    const text = tweet.text.toLowerCase();
    const words = text.split(/\s+/);

    // ── 1. Keyword score ──
    let bullishHits = 0;
    let bearishHits = 0;

    for (const keyword of BULLISH_KEYWORDS) {
      const kw = keyword.toLowerCase();
      const idx = words.indexOf(kw);
      if (idx !== -1 || text.includes(kw)) {
        const pos = idx !== -1 ? idx : words.findIndex(w => w.includes(kw));
        if (pos !== -1 && this.isNegated(words, pos)) {
          bearishHits += 0.5;   // negated bullish → mild bearish
        } else {
          bullishHits++;
        }
      }
    }

    for (const keyword of BEARISH_KEYWORDS) {
      const kw = keyword.toLowerCase();
      const idx = words.indexOf(kw);
      if (idx !== -1 || text.includes(kw)) {
        const pos = idx !== -1 ? idx : words.findIndex(w => w.includes(kw));
        if (pos !== -1 && this.isNegated(words, pos)) {
          bullishHits += 0.5;   // negated bearish → mild bullish
        } else {
          bearishHits++;
        }
      }
    }

    // High-conviction phrases (extra weight)
    for (const phrase of HIGH_CONVICTION_BULLISH) {
      if (text.includes(phrase)) bullishHits += 2;
    }
    for (const phrase of HIGH_CONVICTION_BEARISH) {
      if (text.includes(phrase)) bearishHits += 2;
    }

    const total = bullishHits + bearishHits;
    let keywordScore = 0;
    if (total > 0) {
      keywordScore = ((bullishHits - bearishHits) / total) * 100;
    }

    // ── 2. Emoji-specific score ──
    const bullishEmojis = ['🚀', '📈', '💎', '🔥', '💰', '🤑', '🏆', '✅', '💪', '🌕'];
    const bearishEmojis = ['📉', '💀', '🔻', '🩸', '⚠️', '🚩', '☠️', '🗑️'];
    let emojiScore = 0;
    for (const e of bullishEmojis) {
      emojiScore += (text.split(e).length - 1) * 10;
    }
    for (const e of bearishEmojis) {
      emojiScore -= (text.split(e).length - 1) * 10;
    }
    emojiScore = Math.max(-50, Math.min(50, emojiScore));

    // ── 3. Engagement weighting ──
    const engagementRaw = tweet.likes + tweet.retweets * 2 + tweet.replies * 0.5;
    const engagementScore = Math.min(engagementRaw / 500, 3);   // 0-3 multiplier

    // ── 4. Follower weight ──
    const followerWeight = Math.min(1 + tweet.authorFollowers / 100_000, 2.5);

    // ── 5. Virality bonus — ratio of engagement to follower count ──
    let viralityBonus = 0;
    if (tweet.authorFollowers > 0) {
      const ratio = engagementRaw / tweet.authorFollowers;
      if (ratio > 0.05) viralityBonus = Math.min(ratio * 100, 20);
    }

    // ── Combine signals into final score ──
    const negationAdjustment = 0;   // already applied inline above
    const rawScore = keywordScore * 0.55 + emojiScore * 0.15 + viralityBonus * (keywordScore > 0 ? 1 : -1) * 0.1;
    const score = Math.max(-100, Math.min(100, Math.round(rawScore)));

    let confidence = 0;
    if (total > 0) {
      confidence = Math.min(total * 18, 100);
    }
    confidence = Math.min(confidence * (1 + engagementScore * 0.3) * (followerWeight * 0.6), 100);
    confidence = Math.round(confidence);

    const signals: SentimentSignals = {
      keywordScore: Math.round(keywordScore),
      engagementScore: Math.round(engagementScore * 100) / 100,
      followerWeight: Math.round(followerWeight * 100) / 100,
      emojiScore,
      negationAdjustment,
      momentumScore: 0,   // set at aggregate level
      viralityBonus: Math.round(viralityBonus * 100) / 100,
    };

    return { score, confidence, signals };
  }

  // ── Aggregate sentiment ──────────────────────────────────────────

  /** Aggregate sentiment for a token from multiple tweets */
  calculateTokenSentiment(token: string, tweets: Tweet[]): SentimentScore {
    const relevant = tweets.filter(t => t.tokens.includes(token));

    if (relevant.length === 0) {
      return {
        token, score: 0, confidence: 0, volume: 0,
        timestamp: new Date(), sources: [],
      };
    }

    let totalScore = 0;
    let totalWeight = 0;
    const sources: string[] = [];
    let aggregatedSignals: SentimentSignals = {
      keywordScore: 0, engagementScore: 0, followerWeight: 0,
      emojiScore: 0, negationAdjustment: 0, momentumScore: 0, viralityBonus: 0,
    };

    for (const tweet of relevant) {
      const { score, confidence, signals } = this.analyzeTweet(tweet);
      const weight = confidence / 100;

      totalScore += score * weight;
      totalWeight += weight;
      sources.push(tweet.id);

      // Accumulate signal averages
      for (const key of Object.keys(aggregatedSignals) as (keyof SentimentSignals)[]) {
        (aggregatedSignals[key] as number) += signals[key] * weight;
      }
    }

    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const avgConfidence = totalWeight > 0 ? (totalWeight / relevant.length) * 100 : 0;

    // Normalize aggregated signals
    if (totalWeight > 0) {
      for (const key of Object.keys(aggregatedSignals) as (keyof SentimentSignals)[]) {
        (aggregatedSignals[key] as number) = Math.round((aggregatedSignals[key] as number) / totalWeight * 100) / 100;
      }
    }

    // ── Momentum: compare to previous score if available ──
    const history = this.sentimentHistory.get(token);
    if (history && history.length > 0) {
      const prev = history[history.length - 1];
      const delta = avgScore - prev.score;
      aggregatedSignals.momentumScore = Math.round(delta * 100) / 100;
    }

    return {
      token,
      score: Math.round(avgScore),
      confidence: Math.round(avgConfidence),
      volume: relevant.length,
      timestamp: new Date(),
      sources,
      signals: aggregatedSignals,
    };
  }

  // ── Batch processing ─────────────────────────────────────────────

  /** Process a batch of tweets and update sentiment */
  processTweets(tweets: Tweet[]): Map<string, SentimentScore> {
    // Extract tokens
    for (const tweet of tweets) {
      tweet.tokens = this.extractTokens(tweet.text);
    }

    const allTokens = new Set<string>();
    for (const tweet of tweets) {
      for (const token of tweet.tokens) allTokens.add(token);
    }

    const results = new Map<string, SentimentScore>();

    for (const token of allTokens) {
      const sentiment = this.calculateTokenSentiment(token, tweets);
      results.set(token, sentiment);

      // Update caches
      if (!this.tweetCache.has(token)) this.tweetCache.set(token, []);
      this.tweetCache.get(token)!.push(...tweets.filter(t => t.tokens.includes(token)));

      if (!this.sentimentHistory.has(token)) this.sentimentHistory.set(token, []);
      this.sentimentHistory.get(token)!.push(sentiment);

      // Keep history bounded (last 500 entries per token)
      const hist = this.sentimentHistory.get(token)!;
      if (hist.length > 500) hist.splice(0, hist.length - 500);
    }

    return results;
  }

  // ── Trending ─────────────────────────────────────────────────────

  getTrending(limit: number = 10): TrendingToken[] {
    const trending: TrendingToken[] = [];

    for (const [symbol, history] of this.sentimentHistory) {
      if (history.length === 0) continue;

      const latest = history[history.length - 1];
      const previous = history.length > 1 ? history[history.length - 2] : latest;

      const changePercent = previous.score !== 0
        ? ((latest.score - previous.score) / Math.abs(previous.score)) * 100
        : latest.score > 0 ? 100 : latest.score < 0 ? -100 : 0;

      trending.push({
        symbol,
        mentions: latest.volume,
        sentimentScore: latest.score,
        changePercent,
        topTweets: latest.sources.slice(0, 5),
      });
    }

    trending.sort((a, b) => {
      const aScore = Math.abs(a.changePercent) * Math.log(a.mentions + 1);
      const bScore = Math.abs(b.changePercent) * Math.log(b.mentions + 1);
      return bScore - aScore;
    });

    return trending.slice(0, limit);
  }

  /** Get current sentiment for a specific token */
  getSentiment(token: string): SentimentScore | null {
    const history = this.sentimentHistory.get(token.toUpperCase());
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  /** Get full history for a token */
  getHistory(token: string): SentimentScore[] {
    return this.sentimentHistory.get(token.toUpperCase()) ?? [];
  }

  /** Clear caches (useful for testing) */
  reset(): void {
    this.tweetCache.clear();
    this.sentimentHistory.clear();
  }
}

// ── Standalone test ──────────────────────────────────────────────────

if (require.main === module) {
  const analyzer = new SentimentAnalyzer();

  const sampleTweets: Tweet[] = [
    {
      id: '1',
      text: '$SOL looking bullish af 🚀 breaking out of this channel, could moon soon',
      author: 'cryptotrader', authorFollowers: 50000,
      timestamp: new Date(), likes: 500, retweets: 100, replies: 50, tokens: [],
    },
    {
      id: '2',
      text: 'Just aped into $BONK, this is the play. wagmi 🔥',
      author: 'degen123', authorFollowers: 10000,
      timestamp: new Date(), likes: 200, retweets: 50, replies: 30, tokens: [],
    },
    {
      id: '3',
      text: '$JUP looking like a scam tbh, devs dumping on retail. bearish 📉',
      author: 'skeptic_whale', authorFollowers: 100000,
      timestamp: new Date(), likes: 1000, retweets: 200, replies: 150, tokens: [],
    },
    {
      id: '4',
      text: "I don't think $SOL is bullish at all right now, not buying this pump",
      author: 'contrarian', authorFollowers: 30000,
      timestamp: new Date(), likes: 80, retweets: 10, replies: 5, tokens: [],
    },
  ];

  const results = analyzer.processTweets(sampleTweets);

  console.log('\n📊 Sentiment Analysis Results:\n');
  for (const [token, sentiment] of results) {
    const emoji = sentiment.score > 20 ? '🟢' : sentiment.score < -20 ? '🔴' : '🟡';
    console.log(`${emoji} ${token}: ${sentiment.score > 0 ? '+' : ''}${sentiment.score} (confidence: ${sentiment.confidence}%, volume: ${sentiment.volume})`);
    if (sentiment.signals) {
      console.log(`   signals: keyword=${sentiment.signals.keywordScore} emoji=${sentiment.signals.emojiScore} virality=${sentiment.signals.viralityBonus}`);
    }
  }

  console.log('\n📈 Trending:\n');
  const trending = analyzer.getTrending(5);
  for (const t of trending) {
    console.log(`  ${t.symbol}: ${t.mentions} mentions, sentiment ${t.sentimentScore}, change ${t.changePercent.toFixed(1)}%`);
  }
}
