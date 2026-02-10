// Sentiment uploader - pushes data from local cache to Solana
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm");
const DATA_DIR = path.join(__dirname, "..", "data");

// Initialize Anchor provider
function getProvider() {
  const connection = new anchor.web3.Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  
  const walletPath = process.env.SOLANA_WALLET || (process.env.HOME + "/.config/solana/id.json");
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}. Set SOLANA_WALLET env var.`);
  }
  const wallet = new anchor.Wallet(
    anchor.web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    )
  );
  
  return new anchor.AnchorProvider(connection, wallet, {});
}

// Load latest sentiment data from the data/ directory
function getLatestSentimentFile(): any | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith("sentiment-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), "utf-8"));
}

// Load sentiment data from local cache files
async function getSentimentData(): Promise<Array<{ symbol: string; score: number; confidence: number; volume: number; timestamp: number }>> {
  const latest = getLatestSentimentFile();
  if (!latest || !latest.results) {
    console.log("⚠️  No data files found in data/, using fallback mock data");
    return [
      { symbol: "SOL", score: 75, confidence: 85, volume: 1250, timestamp: Date.now() / 1000 },
      { symbol: "BONK", score: 60, confidence: 70, volume: 890, timestamp: Date.now() / 1000 },
      { symbol: "WIF", score: -20, confidence: 65, volume: 450, timestamp: Date.now() / 1000 },
    ];
  }

  console.log(`📂 Reading from data file: ${latest.timestamp}`);
  const entries = Object.entries(latest.results) as [string, any][];
  
  // Pick top tokens by volume for upload (avoid uploading 80+ tokens)
  const maxTokens = parseInt(process.env.UPLOAD_MAX_TOKENS || "10");
  const sorted = entries
    .filter(([_, v]) => v.volume > 0 && v.confidence > 30)
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, maxTokens);

  return sorted.map(([symbol, data]) => ({
    symbol,
    score: Math.max(-100, Math.min(100, data.score)),
    confidence: Math.min(100, data.confidence),
    volume: data.volume,
    timestamp: new Date(data.timestamp || latest.timestamp).getTime() / 1000,
  }));
}

// Upload sentiment to Solana
async function uploadSentiment() {
  console.log("🚀 Starting sentiment upload to devnet...");
  
  let provider: anchor.AnchorProvider;
  try {
    provider = getProvider();
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    console.log("\nTo upload on-chain, you need a Solana wallet keypair.");
    console.log("Generate one with: solana-keygen new");
    console.log("Fund it with: solana airdrop 2 --url devnet");
    return;
  }

  const sentimentData = await getSentimentData();
  console.log(`📊 Uploading ${sentimentData.length} tokens to devnet...`);
  console.log(`   Authority: ${provider.wallet.publicKey.toBase58()}`);
  console.log("");
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const data of sentimentData) {
    try {
      const [sentimentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sentiment"), Buffer.from(data.symbol)],
        PROGRAM_ID
      );
      
      const [sentinelPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sentinel")],
        PROGRAM_ID
      );

      // Check if account already exists
      const existing = await provider.connection.getAccountInfo(sentimentPda);
      if (existing) {
        console.log(`  ⏭️  ${data.symbol}: already on-chain (PDA exists)`);
        skipCount++;
        continue;
      }
      
      const emoji = data.score > 20 ? "🟢" : data.score < -20 ? "🔴" : "🟡";
      console.log(`  ${emoji} ${data.symbol}: score=${data.score}, confidence=${data.confidence}%, vol=${data.volume}`);
      
      // Build store_sentiment instruction manually (Anchor discriminator + args)
      const symbolBytes = Buffer.from(data.symbol);
      const discriminator = Buffer.from([79, 193, 205, 109, 72, 111, 47, 166]); // store_sentiment
      const symLen = Buffer.alloc(4);
      symLen.writeUInt32LE(symbolBytes.length);
      const scoreBuf = Buffer.alloc(1);
      scoreBuf.writeInt8(data.score);
      const confBuf = Buffer.alloc(1);
      confBuf.writeUInt8(data.confidence);
      const volBuf = Buffer.alloc(4);
      volBuf.writeUInt32LE(data.volume);
      const tsBuf = Buffer.alloc(8);
      tsBuf.writeBigInt64LE(BigInt(Math.floor(data.timestamp)));

      const ixData = Buffer.concat([discriminator, symLen, symbolBytes, scoreBuf, confBuf, volBuf, tsBuf]);

      const ix = new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: sentinelPda, isSigner: false, isWritable: true },
          { pubkey: sentimentPda, isSigner: false, isWritable: true },
          { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: ixData,
      });

      const tx = new anchor.web3.Transaction().add(ix);
      const sig = await provider.sendAndConfirm(tx);
      console.log(`     ✅ Tx: ${sig.slice(0, 16)}...`);
      successCount++;
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log(`  ⏭️  ${data.symbol}: account already exists`);
        skipCount++;
      } else {
        console.error(`  ❌ ${data.symbol}: ${e.message?.slice(0, 100)}`);
        errorCount++;
      }
    }
  }

  console.log("");
  console.log(`📋 Summary: ${successCount} uploaded, ${skipCount} skipped, ${errorCount} errors`);
  
  console.log("✅ Upload complete!");
}

// Run uploader
if (require.main === module) {
  uploadSentiment()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export { uploadSentiment };
