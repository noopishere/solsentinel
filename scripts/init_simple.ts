// Simple initialize script
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";

async function main() {
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const walletPath = process.env.HOME + "/.config/solana/id.json";
  const wallet = new anchor.Wallet(
    anchor.web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    )
  );
  
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  
  const programId = new PublicKey("HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm");
  const idl = JSON.parse(fs.readFileSync("target/idl/sol_sentinel.json", "utf-8"));
  
  const program = new anchor.Program(idl, programId, provider);
  
  console.log("🚀 Initializing SolSentinel");
  console.log("Program ID:", programId.toString());
  console.log("Wallet:", wallet.publicKey.toString());
  
  const [sentinelPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sentinel")],
    programId
  );
  
  console.log("Sentinel PDA:", sentinelPda.toString());
  
  try {
    const tx = await program.methods
      .initialize()
      .accounts({
        sentinel: sentinelPda,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log("✅ Initialized! Tx:", tx);
    
    await connection.confirmTransaction(tx);
    
    const sentinel = await program.account.sentinel.fetch(sentinelPda);
    console.log("Authority:", (sentinel as any).authority.toString());
    console.log("Total updates:", (sentinel as any).totalUpdates.toString());
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("⚠️  Already initialized!");
      const sentinel = await program.account.sentinel.fetch(sentinelPda);
      console.log("Authority:", (sentinel as any).authority.toString());
      console.log("Total updates:", (sentinel as any).totalUpdates.toString());
    } else {
      console.error("Error:", e);
    }
  }
}

main().catch(console.error);
