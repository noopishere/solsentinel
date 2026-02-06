#!/bin/bash
# Initialize SolSentinel oracle on devnet

set -e

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
source $HOME/.cargo/env

PROGRAM_ID="HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm"

echo "🚀 Initializing SolSentinel Oracle"
echo "Program ID: $PROGRAM_ID"
echo "Network: Devnet"
echo ""

# Check balance
echo "Checking wallet balance..."
solana balance --url devnet

# Calculate Sentinel PDA
echo ""
echo "Calculating Sentinel PDA..."
SENTINEL_PDA=$(solana address --seed "sentinel" --program-id $PROGRAM_ID)
echo "Sentinel PDA: $SENTINEL_PDA"

# Check if already initialized
echo ""
echo "Checking if oracle is already initialized..."
if solana account $SENTINEL_PDA --url devnet &>/dev/null; then
  echo "✅ Oracle already initialized!"
  solana account $SENTINEL_PDA --url devnet
else
  echo "⚠️  Oracle not initialized yet"
  echo "Run the TypeScript initialization script with proper IDL"
fi
