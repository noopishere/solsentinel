// Initialize SolSentinel on devnet
import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolSentinel;
  
  console.log("🚀 Initializing SolSentinel on devnet");
  console.log("Program ID:", program.programId.toString());
  console.log("Authority:", provider.wallet.publicKey.toString());

  const [sentinelPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("sentinel")],
    program.programId
  );

  try {
    await program.methods
      .initialize()
      .accounts({
        sentinel: sentinelPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    console.log("✅ SolSentinel initialized!");
    console.log("Sentinel PDA:", sentinelPda.toString());

    const sentinel = await program.account.sentinel.fetch(sentinelPda);
    console.log("Authority:", (sentinel as any).authority.toString());
    console.log("Total updates:", (sentinel as any).totalUpdates.toString());
  } catch (e) {
    console.error("Error:", e);
  }
}

main().catch(console.error);
