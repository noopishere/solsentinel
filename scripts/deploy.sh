#!/bin/bash
# Deploy SolSentinel to devnet

set -e

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
source $HOME/.cargo/env

echo "🔍 Checking Solana config..."
solana config set --url devnet
solana balance

echo "🏗️  Building program..."
anchor build

echo "🚀 Deploying to devnet..."
anchor deploy

echo "✅ Deployment complete!"
echo "Program ID:"
solana address -k target/deploy/sol_sentinel-keypair.json

echo ""
echo "📝 Initializing oracle..."
anchor run initialize

echo "🎉 SolSentinel is live on devnet!"
