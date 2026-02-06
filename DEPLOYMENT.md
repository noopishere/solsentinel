# SolSentinel Deployment

## Devnet Deployment ✅

**Program ID:** `HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm`

**Deployed:** Feb 6, 2026 09:17 UTC

**Network:** Devnet

**IDL Account:** `4oEn7QFKWFKpoeJV3vmfoSd1sp6ZGQKr6U1jnoDBvh8W`

## Features Deployed

### Core Oracle
- ✅ Store sentiment data on-chain
- ✅ Batch sentiment updates (up to 10 tokens)
- ✅ Authority management
- ✅ Event emissions for indexing

### Social Features  
- ✅ User profiles with reputation system
- ✅ Token subscriptions & alert thresholds
- ✅ Community voting on sentiment
- ✅ Prediction tracking (accuracy-based reputation)

## Program Info

```bash
solana program show HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm --url devnet
```

**Output:**
```
Program Id: HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: 2PWPC4oiJJJtdRqUAFHzKCmtHDGjCuhaE1eXZTusMofE
Authority: J8xZXoenhs8jegKf6esJXcpkpAiGrmMq5EWLSPNrBE9Y
Last Deployed In Slot: 440247438
Data Length: 283920 (0x45510) bytes
Balance: 1.97728728 SOL
```

## Next Steps

1. Initialize the oracle (create Sentinel PDA)
2. Connect API to upload sentiment data
3. Build frontend for community features
4. Test all social functions (profiles, subscriptions, voting)
5. Set up event listeners for real-time updates
6. Deploy to mainnet after testing

## Accounts

- **Sentinel PDA:** TBD (created on initialize)
- **Sentiment Records:** `[SENTIMENT_SEED, symbol]` seeds
- **User Profiles:** `[USER_PROFILE_SEED, user_pubkey]` seeds
- **Subscriptions:** `[SUBSCRIPTION_SEED, user_pubkey, symbol]` seeds
- **Votes:** `[b"vote", user_pubkey, symbol]` seeds

## Hackathon Submission

- **Project:** SolSentinel
- **Category:** Oracle / Sentiment Analysis
- **Deadline:** Feb 12, 2026
- **Status:** On-chain + social features deployed ✅
