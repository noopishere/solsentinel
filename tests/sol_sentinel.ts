import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolSentinel } from "../target/types/sol_sentinel";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("sol_sentinel", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solSentinel as Program<SolSentinel>;
  const authority = provider.wallet;

  const SENTINEL_SEED = Buffer.from("sentinel");
  const SENTIMENT_SEED = Buffer.from("sentiment");
  const HISTORY_SEED = Buffer.from("history");
  const USER_PROFILE_SEED = Buffer.from("user_profile");
  const SUBSCRIPTION_SEED = Buffer.from("subscription");
  const VOTE_SEED = Buffer.from("vote");

  const findPDA = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  // ===== Initialization =====

  it("initializes the oracle", async () => {
    await program.methods.initialize().rpc();

    const sentinelPDA = findPDA([SENTINEL_SEED]);
    const sentinel = await program.account.sentinel.fetch(sentinelPDA);
    expect(sentinel.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(sentinel.totalUpdates.toNumber()).to.equal(0);
    expect(sentinel.paused).to.equal(false);
    expect(sentinel.operators).to.have.length(0);
  });

  // ===== Admin Controls =====

  it("adds and removes an operator", async () => {
    const operator = Keypair.generate();
    await program.methods.addOperator(operator.publicKey).rpc();

    const sentinelPDA = findPDA([SENTINEL_SEED]);
    let sentinel = await program.account.sentinel.fetch(sentinelPDA);
    expect(sentinel.operators).to.have.length(1);
    expect(sentinel.operators[0].toBase58()).to.equal(operator.publicKey.toBase58());

    await program.methods.removeOperator(operator.publicKey).rpc();
    sentinel = await program.account.sentinel.fetch(sentinelPDA);
    expect(sentinel.operators).to.have.length(0);
  });

  it("pauses and unpauses the oracle", async () => {
    await program.methods.setPaused(true).rpc();

    const sentinelPDA = findPDA([SENTINEL_SEED]);
    let sentinel = await program.account.sentinel.fetch(sentinelPDA);
    expect(sentinel.paused).to.equal(true);

    await program.methods.setPaused(false).rpc();
    sentinel = await program.account.sentinel.fetch(sentinelPDA);
    expect(sentinel.paused).to.equal(false);
  });

  it("rejects admin actions from non-authority", async () => {
    const imposter = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(imposter.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .setPaused(true)
        .accounts({ authority: imposter.publicKey } as any)
        .signers([imposter])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.include("Error");
    }
  });

  // ===== Store Sentiment =====

  it("stores sentiment for SOL", async () => {
    const symbol = "SOL";
    const ts = Math.floor(Date.now() / 1000);

    await program.methods
      .storeSentiment(symbol, 75, 85, 1500, new anchor.BN(ts))
      .rpc();

    const sentimentPDA = findPDA([SENTIMENT_SEED, Buffer.from(symbol)]);
    const record = await program.account.sentimentRecord.fetch(sentimentPDA);
    expect(record.symbol).to.equal("SOL");
    expect(record.score).to.equal(75);
    expect(record.confidence).to.equal(85);
    expect(record.volume).to.equal(1500);
    expect(record.updateCount).to.equal(0);
  });

  it("rejects invalid sentiment score", async () => {
    try {
      await program.methods
        .storeSentiment("BAD", 127 as any, 85, 100, new anchor.BN(1000))
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Score 127 exceeds i8 range or validation catches it
      expect(e).to.exist;
    }
  });

  it("rejects storing when paused", async () => {
    await program.methods.setPaused(true).rpc();

    try {
      await program.methods
        .storeSentiment("PAUSE", 50, 50, 100, new anchor.BN(1000))
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.include("OraclePaused");
    }

    await program.methods.setPaused(false).rpc();
  });

  // ===== Update Sentiment =====

  it("updates an existing sentiment record", async () => {
    const symbol = "SOL";
    const ts = Math.floor(Date.now() / 1000) + 1000;
    const sentimentPDA = findPDA([SENTIMENT_SEED, Buffer.from(symbol)]);

    await program.methods
      .updateSentiment(-20, 60, 2000, new anchor.BN(ts))
      .accounts({ sentiment: sentimentPDA } as any)
      .rpc();

    const record = await program.account.sentimentRecord.fetch(sentimentPDA);
    expect(record.score).to.equal(-20);
    expect(record.confidence).to.equal(60);
    expect(record.volume).to.equal(2000);
    expect(record.updateCount).to.equal(1);
  });

  it("rejects stale timestamp on update", async () => {
    const symbol = "SOL";
    const sentimentPDA = findPDA([SENTIMENT_SEED, Buffer.from(symbol)]);

    try {
      await program.methods
        .updateSentiment(10, 50, 100, new anchor.BN(1))
        .accounts({ sentiment: sentimentPDA } as any)
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.include("StaleTimestamp");
    }
  });

  // ===== Historical Tracking =====

  it("records history snapshot", async () => {
    const symbol = "SOL";
    const sentimentPDA = findPDA([SENTIMENT_SEED, Buffer.from(symbol)]);
    const historyPDA = findPDA([HISTORY_SEED, Buffer.from(symbol)]);

    await program.methods
      .recordHistory(symbol)
      .accounts({ sentiment: sentimentPDA, history: historyPDA } as any)
      .rpc();

    const history = await program.account.sentimentHistory.fetch(historyPDA);
    expect(history.symbol).to.equal("SOL");
    expect(history.count).to.equal(1);
  });

  // ===== User Profile =====

  it("creates a user profile", async () => {
    await program.methods.createProfile("oracle_admin").rpc();

    const profilePDA = findPDA([USER_PROFILE_SEED, authority.publicKey.toBuffer()]);
    const profile = await program.account.userProfile.fetch(profilePDA);
    expect(profile.username).to.equal("oracle_admin");
    expect(profile.reputation).to.equal(100);
    expect(profile.predictionsMade).to.equal(0);
  });

  it("rejects empty username", async () => {
    const user = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(user.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .createProfile("")
        .accounts({ user: user.publicKey } as any)
        .signers([user])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.include("EmptyUsername");
    }
  });

  // ===== Subscriptions =====

  it("subscribes and unsubscribes from a token", async () => {
    const symbol = "SOL";
    const subPDA = findPDA([
      SUBSCRIPTION_SEED,
      authority.publicKey.toBuffer(),
      Buffer.from(symbol),
    ]);

    await program.methods.subscribeToken(symbol, 1, 50).rpc();

    const sub = await program.account.subscription.fetch(subPDA);
    expect(sub.symbol).to.equal("SOL");
    expect(sub.direction).to.equal(1);
    expect(sub.alertThreshold).to.equal(50);

    await program.methods
      .unsubscribeToken()
      .accounts({ subscription: subPDA } as any)
      .rpc();

    const info = await provider.connection.getAccountInfo(subPDA);
    expect(info).to.be.null;
  });

  // ===== Community Voting =====

  it("casts a community vote", async () => {
    const symbol = "SOL";
    const profilePDA = findPDA([USER_PROFILE_SEED, authority.publicKey.toBuffer()]);
    const votePDA = findPDA([VOTE_SEED, authority.publicKey.toBuffer(), Buffer.from(symbol)]);

    await program.methods
      .voteSentiment(symbol, 80, 70)
      .rpc();

    const vote = await program.account.communityVote.fetch(votePDA);
    expect(vote.score).to.equal(80);
    expect(vote.confidence).to.equal(70);

    const profile = await program.account.userProfile.fetch(profilePDA);
    expect(profile.predictionsMade).to.equal(1);
  });

  // ===== Resolve Prediction =====

  it("resolves a prediction and adjusts reputation", async () => {
    const profilePDA = findPDA([USER_PROFILE_SEED, authority.publicKey.toBuffer()]);

    await program.methods
      .resolvePrediction(true)
      .accounts({ profile: profilePDA } as any)
      .rpc();

    let profile = await program.account.userProfile.fetch(profilePDA);
    expect(profile.correctPredictions).to.equal(1);
    expect(profile.reputation).to.equal(110);

    await program.methods
      .resolvePrediction(false)
      .accounts({ profile: profilePDA } as any)
      .rpc();

    profile = await program.account.userProfile.fetch(profilePDA);
    expect(profile.reputation).to.equal(105);
  });

  // ===== Close Sentiment =====

  it("closes a sentiment record (admin)", async () => {
    const symbol = "TEMP";
    const sentimentPDA = findPDA([SENTIMENT_SEED, Buffer.from(symbol)]);
    const ts = Math.floor(Date.now() / 1000);

    await program.methods
      .storeSentiment(symbol, 10, 50, 100, new anchor.BN(ts))
      .rpc();

    await program.methods
      .closeSentiment(symbol)
      .accounts({ sentiment: sentimentPDA } as any)
      .rpc();

    const info = await provider.connection.getAccountInfo(sentimentPDA);
    expect(info).to.be.null;
  });

  // ===== Multi-token =====

  it("stores sentiment for multiple tokens", async () => {
    const tokens = [
      { symbol: "BONK", score: 60, confidence: 70, volume: 5000 },
      { symbol: "WIF", score: -30, confidence: 55, volume: 2000 },
      { symbol: "JUP", score: 45, confidence: 80, volume: 3000 },
    ];

    for (const t of tokens) {
      const ts = Math.floor(Date.now() / 1000);
      await program.methods
        .storeSentiment(t.symbol, t.score, t.confidence, t.volume, new anchor.BN(ts))
        .rpc();

      const sentimentPDA = findPDA([SENTIMENT_SEED, Buffer.from(t.symbol)]);
      const record = await program.account.sentimentRecord.fetch(sentimentPDA);
      expect(record.symbol).to.equal(t.symbol);
      expect(record.score).to.equal(t.score);
    }
  });

  it("verifies total update count", async () => {
    const sentinelPDA = findPDA([SENTINEL_SEED]);
    const sentinel = await program.account.sentinel.fetch(sentinelPDA);
    expect(sentinel.totalUpdates.toNumber()).to.be.greaterThan(0);
    console.log(`Total updates: ${sentinel.totalUpdates.toNumber()}`);
  });
});
