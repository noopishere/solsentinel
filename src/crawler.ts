// Twitter Crawler for SolSentinel
// Uses Playwright to scrape crypto Twitter

import { chromium, Browser, Page } from 'playwright';
import { Tweet, TRACKED_TOKENS } from './types';
import { SentimentAnalyzer } from './analyzer';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = '/root/.openclaw/workspace/.secrets/x_cookies.json';
const DATA_DIR = '/root/.openclaw/workspace/solsentinel/data';

export class TwitterCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private analyzer: SentimentAnalyzer;

  constructor() {
    this.analyzer = new SentimentAnalyzer();
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Load cookies if available
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await context.addCookies(cookies);
      console.log('✅ Loaded Twitter cookies');
    }

    this.page = await context.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Search Twitter for a specific query
   */
  async searchTweets(query: string, limit: number = 50): Promise<Tweet[]> {
    if (!this.page) throw new Error('Crawler not initialized');

    const tweets: Tweet[] = [];
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;

    console.log(`🔍 Searching: ${query}`);
    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.waitForTimeout(3000);

    // Scroll to load more tweets
    for (let i = 0; i < 3 && tweets.length < limit; i++) {
      await this.page.mouse.wheel(0, 1000);
      await this.page.waitForTimeout(2000);

      // Extract tweets from the page
      const newTweets = await this.page.evaluate(() => {
        const articles = document.querySelectorAll('article');
        const results: any[] = [];

        articles.forEach(article => {
          try {
            const textEl = article.querySelector('[data-testid="tweetText"]');
            const text = textEl?.textContent || '';
            
            const authorEl = article.querySelector('[data-testid="User-Name"] a');
            const author = authorEl?.getAttribute('href')?.replace('/', '') || 'unknown';
            
            // Get engagement metrics
            const likesEl = article.querySelector('[data-testid="like"] span');
            const likes = parseInt(likesEl?.textContent || '0') || 0;
            
            const retweetsEl = article.querySelector('[data-testid="retweet"] span');
            const retweets = parseInt(retweetsEl?.textContent || '0') || 0;
            
            const repliesEl = article.querySelector('[data-testid="reply"] span');
            const replies = parseInt(repliesEl?.textContent || '0') || 0;

            const tweetLink = article.querySelector('a[href*="/status/"]');
            const id = tweetLink?.getAttribute('href')?.split('/status/')[1]?.split('?')[0] || '';

            if (text && id) {
              results.push({
                id,
                text,
                author,
                likes,
                retweets,
                replies
              });
            }
          } catch (e) {
            // Skip malformed tweets
          }
        });

        return results;
      });

      // Dedupe and add to results
      for (const t of newTweets) {
        if (!tweets.find(existing => existing.id === t.id)) {
          tweets.push({
            ...t,
            authorFollowers: 1000, // Default, would need API for real count
            timestamp: new Date(),
            tokens: []
          });
        }
      }
    }

    console.log(`  Found ${tweets.length} tweets`);
    return tweets.slice(0, limit);
  }

  /**
   * Reinitialize browser if closed
   */
  private async ensureBrowser(): Promise<boolean> {
    try {
      // Test if page is still alive
      if (this.page) {
        await this.page.evaluate(() => true);
        return true;
      }
    } catch {
      // Browser/page is dead, reinitialize
      console.log('  ⚠️ Browser closed, reinitializing...');
    }
    
    try {
      await this.close();
      await this.init();
      return true;
    } catch (e) {
      console.error('  Failed to reinitialize browser:', e);
      return false;
    }
  }

  /**
   * Crawl sentiment for tracked tokens
   */
  async crawlTokens(tokenLimit: number = 10): Promise<Map<string, any>> {
    const allTweets: Tweet[] = [];
    const tokensToTrack = TRACKED_TOKENS.slice(0, tokenLimit);
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    for (const token of tokensToTrack) {
      // Check if we should stop due to too many errors
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.log(`\n⚠️ Too many consecutive errors, stopping early with ${allTweets.length} tweets`);
        break;
      }

      try {
        // Ensure browser is alive
        if (!await this.ensureBrowser()) {
          consecutiveErrors++;
          continue;
        }

        const query = `$${token} (bullish OR bearish OR moon OR dump OR buy OR sell) -is:retweet`;
        const tweets = await this.searchTweets(query, 20);
        allTweets.push(...tweets);
        consecutiveErrors = 0; // Reset on success
        
        // Rate limit friendly - random delay between 2-4 seconds
        const delay = 2000 + Math.random() * 2000;
        await this.page?.waitForTimeout(delay);
      } catch (e: any) {
        consecutiveErrors++;
        const errorMsg = e.message?.slice(0, 100) || String(e);
        console.error(`  Error crawling ${token}: ${errorMsg}`);
      }
    }

    // Analyze all collected tweets
    const results = this.analyzer.processTweets(allTweets);
    
    return results;
  }

  /**
   * Save crawl results to disk
   */
  saveResults(results: Map<string, any>): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(DATA_DIR, `sentiment-${timestamp}.json`);
    
    const data = {
      timestamp: new Date().toISOString(),
      results: Object.fromEntries(results)
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved results to ${filename}`);
  }
}

// Main execution
async function main() {
  console.log('🔮 SolSentinel Crawler Starting...\n');

  const crawler = new TwitterCrawler();
  
  try {
    await crawler.init();
    const results = await crawler.crawlTokens();
    
    console.log('\n📊 Sentiment Summary:\n');
    for (const [token, sentiment] of results) {
      const emoji = sentiment.score > 20 ? '🟢' : sentiment.score < -20 ? '🔴' : '🟡';
      console.log(`${emoji} ${token}: ${sentiment.score > 0 ? '+' : ''}${sentiment.score} (${sentiment.volume} mentions, ${sentiment.confidence}% confidence)`);
    }

    crawler.saveResults(results);
    
  } catch (error) {
    console.error('Crawler error:', error);
  } finally {
    await crawler.close();
  }

  console.log('\n✅ Crawl complete!');
}

if (require.main === module) {
  main();
}

// TwitterCrawler is exported via class declaration above
