// TypeScript client for SolSentinel on-chain program
// Publishes sentiment data to Solana PDAs

import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Keypair, Connection } from '@solana/web3.js';
import { SentimentScore } from './types';

// Program ID - replace with deployed address
const PROGRAM_ID = new PublicKey('SoLSentineLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

// Seeds
const SENTINEL_SEED = Buffer.from('sentinel');
const SENTIMENT_SEED = Buffer.from('sentiment');

export interface OnChainConfig {
  rpcUrl: string;
  wallet: Keypair;
}

export class SolSentinelClient {
  private connection: Connection;
  private wallet: Keypair;
  private provider: AnchorProvider;

  constructor(config: OnChainConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.wallet = config.wallet;
    
    // Create anchor provider
    const walletAdapter = {
      publicKey: this.wallet.publicKey,
      signTransaction: async (tx: web3.Transaction) => {
        tx.partialSign(this.wallet);
        return tx;
      },
      signAllTransactions: async (txs: web3.Transaction[]) => {
        return txs.map(tx => {
          tx.partialSign(this.wallet);
          return tx;
        });
      }
    };
    
    this.provider = new AnchorProvider(this.connection, walletAdapter as any, {
      commitment: 'confirmed'
    });
  }

  /**
   * Get the sentinel PDA address
   */
  getSentinelPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SENTINEL_SEED],
      PROGRAM_ID
    );
  }

  /**
   * Get sentiment PDA for a token symbol
   */
  getSentimentPDA(symbol: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SENTIMENT_SEED, Buffer.from(symbol.toUpperCase())],
      PROGRAM_ID
    );
  }

  /**
   * Initialize the oracle (one-time setup)
   */
  async initialize(): Promise<string> {
    const [sentinelPDA] = this.getSentinelPDA();
    
    // Build instruction manually since we don't have the IDL loaded
    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: sentinelPDA, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]) // Initialize discriminator
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    console.log(`✅ Initialized SolSentinel. Tx: ${sig}`);
    return sig;
  }

  /**
   * Store sentiment for a single token
   */
  async storeSentiment(sentiment: SentimentScore): Promise<string> {
    const [sentinelPDA] = this.getSentinelPDA();
    const [sentimentPDA] = this.getSentimentPDA(sentiment.token);
    const timestamp = Math.floor(sentiment.timestamp.getTime() / 1000);

    // Encode instruction data
    // Format: discriminator (8) + symbol (4 + len) + score (1) + confidence (1) + volume (4) + timestamp (8)
    const symbolBytes = Buffer.from(sentiment.token.toUpperCase());
    const data = Buffer.concat([
      Buffer.from([79, 193, 205, 109, 72, 111, 47, 166]), // store_sentiment discriminator
      Buffer.from(new Uint32Array([symbolBytes.length]).buffer), // symbol length
      symbolBytes,
      Buffer.from(new Int8Array([sentiment.score]).buffer),
      Buffer.from(new Uint8Array([sentiment.confidence]).buffer),
      Buffer.from(new Uint32Array([sentiment.volume]).buffer),
      Buffer.from(new BigInt64Array([BigInt(timestamp)]).buffer)
    ]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: sentinelPDA, isSigner: false, isWritable: true },
        { pubkey: sentimentPDA, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    
    console.log(`📊 Stored ${sentiment.token}: ${sentiment.score} (tx: ${sig.slice(0, 8)}...)`);
    return sig;
  }

  /**
   * Batch store multiple sentiments (more gas efficient)
   */
  async batchStoreSentiment(sentiments: SentimentScore[]): Promise<string[]> {
    const sigs: string[] = [];
    
    // Store each sentiment (could be optimized with batch instruction)
    for (const sentiment of sentiments) {
      try {
        const sig = await this.storeSentiment(sentiment);
        sigs.push(sig);
      } catch (e) {
        console.error(`Failed to store ${sentiment.token}:`, e);
      }
    }
    
    return sigs;
  }

  /**
   * Fetch sentiment data from chain
   */
  async getSentiment(symbol: string): Promise<any | null> {
    const [sentimentPDA] = this.getSentimentPDA(symbol);
    
    try {
      const accountInfo = await this.connection.getAccountInfo(sentimentPDA);
      if (!accountInfo) return null;

      // Decode manually (skip 8-byte discriminator)
      const data = accountInfo.data;
      const symbolLen = data.readUInt32LE(8);
      const symbolBytes = data.slice(12, 12 + symbolLen);
      const offset = 12 + symbolLen;
      
      return {
        symbol: symbolBytes.toString(),
        score: data.readInt8(offset),
        confidence: data.readUInt8(offset + 1),
        volume: data.readUInt32LE(offset + 2),
        timestamp: Number(data.readBigInt64LE(offset + 6)),
        updater: new PublicKey(data.slice(offset + 14, offset + 46)).toBase58()
      };
    } catch (e) {
      console.error(`Failed to fetch sentiment for ${symbol}:`, e);
      return null;
    }
  }

  /**
   * Get oracle stats
   */
  async getOracleStats(): Promise<any | null> {
    const [sentinelPDA] = this.getSentinelPDA();
    
    try {
      const accountInfo = await this.connection.getAccountInfo(sentinelPDA);
      if (!accountInfo) return null;

      const data = accountInfo.data;
      return {
        authority: new PublicKey(data.slice(8, 40)).toBase58(),
        totalUpdates: Number(data.readBigUInt64LE(40)),
        bump: data.readUInt8(48)
      };
    } catch (e) {
      console.error('Failed to fetch oracle stats:', e);
      return null;
    }
  }
}

// Helper to create client from environment
export function createClient(): SolSentinelClient | null {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  
  if (!privateKey) {
    console.warn('⚠️ SOLANA_PRIVATE_KEY not set, on-chain publishing disabled');
    return null;
  }
  
  try {
    const keypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(privateKey))
    );
    
    return new SolSentinelClient({
      rpcUrl,
      wallet: keypair
    });
  } catch (e) {
    console.error('Failed to create Solana client:', e);
    return null;
  }
}

// Test if run directly
if (require.main === module) {
  console.log('🔮 SolSentinel On-Chain Client');
  console.log('Program ID:', PROGRAM_ID.toBase58());
  
  const client = createClient();
  if (client) {
    const [sentinelPDA] = client.getSentinelPDA();
    console.log('Sentinel PDA:', sentinelPDA.toBase58());
    
    const [solPDA] = client.getSentimentPDA('SOL');
    console.log('SOL Sentiment PDA:', solPDA.toBase58());
  } else {
    console.log('\nTo enable on-chain publishing, set:');
    console.log('  SOLANA_RPC_URL=https://api.devnet.solana.com');
    console.log('  SOLANA_PRIVATE_KEY=[your keypair array]');
  }
}
