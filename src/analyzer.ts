// Sentiment Analysis Engine for SolSentinel

import { 
  Tweet, 
  SentimentScore, 
  TrendingToken,
  BULLISH_KEYWORDS, 
  BEARISH_KEYWORDS,
  TRACKED_TOKENS
} from './types';

export class SentimentAnalyzer {
  private tweetCache: Map<string, Tweet[]> = new Map();
  private sentimentHistory: Map<string, SentimentScore[]> = new Map();

  /**
   * Extract token symbols from tweet text
   */
  extractTokens(text: string): string[] {
    const tokens: string[] = [];
    const upperText = text.toUpperCase();
    
    // Check for $SYMBOL format
    const cashtagRegex = /\$([A-Z]{2,10})/g;
    let match;
    while ((match = cashtagRegex.exec(upperText)) !== null) {
      tokens.push(match[1]);
    }
    
    // Check for tracked tokens mentioned without $
    for (const token of TRACKED_TOKENS) {
      if (upperText.includes(token) && !tokens.includes(token)) {
        tokens.push(token);
      }
    }
    
    return [...new Set(tokens)];
  }

  /**
   * Calculate sentiment score for a single tweet
   */
  analyzeTweet(tweet: Tweet): { score: number; confidence: number } {
    const text = tweet.text.toLowerCase();
    let bullishCount = 0;
    let bearishCount = 0;
    
    // Count keyword matches
    for (const keyword of BULLISH_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) {
        bullishCount++;
      }
    }
    
    for (const keyword of BEARISH_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) {
        bearishCount++;
      }
    }
    
    // Calculate raw score (-100 to +100)
    const total = bullishCount + bearishCount;
    let score = 0;
    let confidence = 0;
    
    if (total > 0) {
      score = ((bullishCount - bearishCount) / total) * 100;
      confidence = Math.min(total * 20, 100);  // More keywords = higher confidence
    }
    
    // Weight by engagement (likes, retweets) and follower count
    const engagementMultiplier = Math.min(
      1 + (tweet.likes + tweet.retweets * 2) / 1000,
      3  // Cap at 3x
    );
    
    const followerMultiplier = Math.min(
      1 + tweet.authorFollowers / 100000,
      2  // Cap at 2x
    );
    
    confidence = Math.min(confidence * engagementMultiplier * followerMultiplier, 100);
    
    return { score, confidence };
  }

  /**
   * Aggregate sentiment for a token from multiple tweets
   */
  calculateTokenSentiment(token: string, tweets: Tweet[]): SentimentScore {
    const relevantTweets = tweets.filter(t => t.tokens.includes(token));
    
    if (relevantTweets.length === 0) {
      return {
        token,
        score: 0,
        confidence: 0,
        volume: 0,
        timestamp: new Date(),
        sources: []
      };
    }
    
    let totalScore = 0;
    let totalWeight = 0;
    const sources: string[] = [];
    
    for (const tweet of relevantTweets) {
      const { score, confidence } = this.analyzeTweet(tweet);
      const weight = confidence / 100;
      
      totalScore += score * weight;
      totalWeight += weight;
      sources.push(tweet.id);
    }
    
    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const avgConfidence = totalWeight > 0 ? (totalWeight / relevantTweets.length) * 100 : 0;
    
    return {
      token,
      score: Math.round(avgScore),
      confidence: Math.round(avgConfidence),
      volume: relevantTweets.length,
      timestamp: new Date(),
      sources
    };
  }

  /**
   * Process a batch of tweets and update sentiment
   */
  processTweets(tweets: Tweet[]): Map<string, SentimentScore> {
    // Extract tokens from tweets
    for (const tweet of tweets) {
      tweet.tokens = this.extractTokens(tweet.text);
    }
    
    // Find all mentioned tokens
    const allTokens = new Set<string>();
    for (const tweet of tweets) {
      for (const token of tweet.tokens) {
        allTokens.add(token);
      }
    }
    
    // Calculate sentiment for each token
    const results = new Map<string, SentimentScore>();
    for (const token of allTokens) {
      const sentiment = this.calculateTokenSentiment(token, tweets);
      results.set(token, sentiment);
      
      // Update cache
      if (!this.tweetCache.has(token)) {
        this.tweetCache.set(token, []);
      }
      this.tweetCache.get(token)!.push(...tweets.filter(t => t.tokens.includes(token)));
      
      // Update history
      if (!this.sentimentHistory.has(token)) {
        this.sentimentHistory.set(token, []);
      }
      this.sentimentHistory.get(token)!.push(sentiment);
    }
    
    return results;
  }

  /**
   * Get trending tokens based on mention volume and sentiment changes
   */
  getTrending(limit: number = 10): TrendingToken[] {
    const trending: TrendingToken[] = [];
    
    for (const [symbol, history] of this.sentimentHistory) {
      if (history.length === 0) continue;
      
      const latest = history[history.length - 1];
      const previous = history.length > 1 ? history[history.length - 2] : latest;
      
      const changePercent = previous.score !== 0 
        ? ((latest.score - previous.score) / Math.abs(previous.score)) * 100
        : latest.score > 0 ? 100 : -100;
      
      trending.push({
        symbol,
        mentions: latest.volume,
        sentimentScore: latest.score,
        changePercent,
        topTweets: latest.sources.slice(0, 5)
      });
    }
    
    // Sort by absolute change and volume
    trending.sort((a, b) => {
      const aScore = Math.abs(a.changePercent) * Math.log(a.mentions + 1);
      const bScore = Math.abs(b.changePercent) * Math.log(b.mentions + 1);
      return bScore - aScore;
    });
    
    return trending.slice(0, limit);
  }

  /**
   * Get current sentiment for a specific token
   */
  getSentiment(token: string): SentimentScore | null {
    const history = this.sentimentHistory.get(token.toUpperCase());
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }
}

// Standalone analysis for quick testing
if (require.main === module) {
  const analyzer = new SentimentAnalyzer();
  
  // Test with sample tweets
  const sampleTweets: Tweet[] = [
    {
      id: '1',
      text: '$SOL looking bullish af 🚀 breaking out of this channel, could moon soon',
      author: 'cryptotrader',
      authorFollowers: 50000,
      timestamp: new Date(),
      likes: 500,
      retweets: 100,
      replies: 50,
      tokens: []
    },
    {
      id: '2', 
      text: 'Just aped into $BONK, this is the play. wagmi 🔥',
      author: 'degen123',
      authorFollowers: 10000,
      timestamp: new Date(),
      likes: 200,
      retweets: 50,
      replies: 30,
      tokens: []
    },
    {
      id: '3',
      text: '$JUP looking like a scam tbh, devs dumping on retail. bearish 📉',
      author: 'skeptic_whale',
      authorFollowers: 100000,
      timestamp: new Date(),
      likes: 1000,
      retweets: 200,
      replies: 150,
      tokens: []
    }
  ];
  
  const results = analyzer.processTweets(sampleTweets);
  
  console.log('\n📊 Sentiment Analysis Results:\n');
  for (const [token, sentiment] of results) {
    const emoji = sentiment.score > 20 ? '🟢' : sentiment.score < -20 ? '🔴' : '🟡';
    console.log(`${emoji} ${token}: ${sentiment.score > 0 ? '+' : ''}${sentiment.score} (confidence: ${sentiment.confidence}%, volume: ${sentiment.volume})`);
  }
  
  console.log('\n📈 Trending:\n');
  const trending = analyzer.getTrending(5);
  for (const t of trending) {
    console.log(`  ${t.symbol}: ${t.mentions} mentions, sentiment ${t.sentimentScore}, change ${t.changePercent.toFixed(1)}%`);
  }
}
