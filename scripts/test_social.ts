// Test social features of SolSentinel
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolSentinel } from "../target/types/sol_sentinel";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolSentinel as Program<SolSentinel>;
  const user = provider.wallet.publicKey;

  console.log("🧪 Testing SolSentinel Social Features");
  console.log("User:", user.toString());

  // 1. Create user profile
  console.log("\n1️⃣  Creating user profile...");
  try {
    const [profilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), user.toBuffer()],
      program.programId
    );

    await program.methods
      .createProfile("testuser")
      .accounts({
        profile: profilePda,
        user: user,
      })
      .rpc();

    const profile = await program.account.userProfile.fetch(profilePda);
    console.log("✅ Profile created:", profile.username);
    console.log("   Reputation:", profile.reputation);
  } catch (e) {
    console.log("⚠️  Profile might already exist");
  }

  // 2. Subscribe to a token
  console.log("\n2️⃣  Subscribing to SOL...");
  const symbol = "SOL";
  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), user.toBuffer(), Buffer.from(symbol)],
    program.programId
  );

  try {
    await program.methods
      .subscribeToken(symbol, 1, 20) // bullish, alert on 20% change
      .accounts({
        subscription: subscriptionPda,
        user: user,
      })
      .rpc();

    const sub = await program.account.subscription.fetch(subscriptionPda);
    console.log("✅ Subscribed to", sub.symbol);
    console.log("   Direction:", sub.direction === 1 ? "Bullish" : "Bearish");
    console.log("   Alert threshold:", sub.alertThreshold + "%");
  } catch (e) {
    console.log("⚠️  Subscription might already exist");
  }

  // 3. Cast a community vote
  console.log("\n3️⃣  Casting vote on SOL sentiment...");
  const [votePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), user.toBuffer(), Buffer.from(symbol)],
    program.programId
  );

  const [profilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), user.toBuffer()],
    program.programId
  );

  try {
    await program.methods
      .voteSentiment(symbol, 75, 80) // +75 sentiment, 80% confidence
      .accounts({
        vote: votePda,
        profile: profilePda,
        user: user,
      })
      .rpc();

    const vote = await program.account.communityVote.fetch(votePda);
    console.log("✅ Vote cast on", vote.symbol);
    console.log("   Score:", vote.score);
    console.log("   Confidence:", vote.confidence + "%");
  } catch (e) {
    console.log("❌ Vote failed:", e);
  }

  // 4. Record a prediction result (simulate)
  console.log("\n4️⃣  Recording prediction result...");
  try {
    await program.methods
      .recordPredictionResult(true) // correct prediction
      .accounts({
        profile: profilePda,
        user: user,
      })
      .rpc();

    const updatedProfile = await program.account.userProfile.fetch(profilePda);
    const accuracy = (updatedProfile.correctPredictions / updatedProfile.predictionsMade) * 100;
    console.log("✅ Prediction recorded!");
    console.log("   Total predictions:", updatedProfile.predictionsMade);
    console.log("   Accuracy:", accuracy.toFixed(1) + "%");
    console.log("   Reputation:", updatedProfile.reputation);
  } catch (e) {
    console.log("❌ Failed:", e);
  }

  console.log("\n🎉 Social features test complete!");
}

main().catch(console.error);
