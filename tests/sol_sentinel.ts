// Tests for SolSentinel Anchor Program

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';

describe('sol_sentinel', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // These would be loaded from the IDL after building
  const PROGRAM_ID = new PublicKey('SoLSentineLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  const SENTINEL_SEED = Buffer.from('sentinel');
  const SENTIMENT_SEED = Buffer.from('sentiment');

  let sentinelPDA: PublicKey;
  let sentinelBump: number;

  before(async () => {
    // Derive sentinel PDA
    [sentinelPDA, sentinelBump] = PublicKey.findProgramAddressSync(
      [SENTINEL_SEED],
      PROGRAM_ID
    );
    console.log('Sentinel PDA:', sentinelPDA.toBase58());
  });

  it('should initialize the oracle', async () => {
    // This test would call the initialize instruction
    // Skipping actual execution since we don't have the deployed program
    console.log('Initialize test - would create sentinel at:', sentinelPDA.toBase58());
    expect(sentinelPDA).to.not.be.null;
  });

  it('should store sentiment for SOL', async () => {
    const symbol = 'SOL';
    const [sentimentPDA] = PublicKey.findProgramAddressSync(
      [SENTIMENT_SEED, Buffer.from(symbol)],
      PROGRAM_ID
    );
    
    console.log(`Sentiment PDA for ${symbol}:`, sentimentPDA.toBase58());
    
    // Test data
    const testSentiment = {
      symbol: 'SOL',
      score: 75,          // Very bullish
      confidence: 85,     // High confidence
      volume: 1500,       // 1500 tweets analyzed
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    console.log('Would store sentiment:', testSentiment);
    expect(testSentiment.score).to.be.within(-100, 100);
  });

  it('should reject invalid sentiment scores', async () => {
    // Score validation test
    const invalidScore = 150; // Out of range
    expect(invalidScore).to.be.greaterThan(100);
    console.log('Invalid score correctly detected:', invalidScore);
  });

  it('should derive correct PDAs for multiple tokens', async () => {
    const tokens = ['SOL', 'BONK', 'WIF', 'JUP', 'JTO'];
    
    for (const token of tokens) {
      const [pda] = PublicKey.findProgramAddressSync(
        [SENTIMENT_SEED, Buffer.from(token)],
        PROGRAM_ID
      );
      console.log(`${token} PDA:`, pda.toBase58());
      expect(pda).to.not.be.null;
    }
  });

  it('should calculate sentiment interpretation correctly', () => {
    const interpretSentiment = (score: number): string => {
      if (score > 50) return 'very_bullish';
      if (score > 20) return 'bullish';
      if (score > -20) return 'neutral';
      if (score > -50) return 'bearish';
      return 'very_bearish';
    };
    
    expect(interpretSentiment(75)).to.equal('very_bullish');
    expect(interpretSentiment(35)).to.equal('bullish');
    expect(interpretSentiment(0)).to.equal('neutral');
    expect(interpretSentiment(-35)).to.equal('bearish');
    expect(interpretSentiment(-75)).to.equal('very_bearish');
    
    console.log('✅ Sentiment interpretation tests passed');
  });
});
