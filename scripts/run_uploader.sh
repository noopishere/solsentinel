#!/bin/bash
# Run the sentiment uploader to push data on-chain

set -e

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_WALLET="$HOME/.config/solana/id.json"

cd /root/.openclaw/workspace/solsentinel

echo "🚀 Running sentiment uploader..."
echo "Program: HFkhRjLJVwgm6UHfvSqkzJhaQE8GyzjNet8SUNAGjVgm"
echo "Network: Devnet"
echo ""

npx ts-node src/uploader.ts
