// Sentiment uploader - pushes data from API to Solana
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";

const PROGRAM_ID = new PublicKey("HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm");

// Initialize Anchor provider
function getProvider() {
  const connection = new anchor.web3.Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  
  const walletPath = process.env.SOLANA_WALLET || process.env.HOME + "/.config/solana/id.json";
  const wallet = new anchor.Wallet(
    anchor.web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    )
  );
  
  return new anchor.AnchorProvider(connection, wallet, {});
}

// Load sentiment data from local database
async function getSentimentData() {
  // TODO: Connect to actual database
  // For now, return mock data
  return [
    { symbol: "SOL", score: 75, confidence: 85, volume: 1250, timestamp: Date.now() / 1000 },
    { symbol: "BONK", score: 60, confidence: 70, volume: 890, timestamp: Date.now() / 1000 },
    { symbol: "WIF", score: -20, confidence: 65, volume: 450, timestamp: Date.now() / 1000 },
  ];
}

// Upload sentiment to Solana
async function uploadSentiment() {
  console.log("🚀 Starting sentiment upload to devnet...");
  
  const provider = getProvider();
  const idl = JSON.parse(fs.readFileSync("target/idl/sol_sentinel.json", "utf-8"));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);
  
  const sentimentData = await getSentimentData();
  console.log(`📊 Uploading ${sentimentData.length} tokens...`);
  
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
      
      console.log(`  ${data.symbol}: score=${data.score}, confidence=${data.confidence}%`);
      
      const tx = await program.methods
        .storeSentiment(
          data.symbol,
          data.score,
          data.confidence,
          data.volume,
          Math.floor(data.timestamp)
        )
        .accounts({
          sentinel: sentinelPda,
          sentiment: sentimentPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      console.log(`  ✅ Uploaded ${data.symbol} | Tx: ${tx.slice(0, 8)}...`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log(`  ⚠️  ${data.symbol} account already exists (update not implemented yet)`);
      } else {
        console.error(`  ❌ Error uploading ${data.symbol}:`, e.message);
      }
    }
  }
  
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
