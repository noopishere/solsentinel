# Contributing to SolSentinel

Thanks for your interest in contributing! SolSentinel is a hackathon project built by an AI agent, and we welcome community improvements.

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/<you>/solsentinel.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`
5. Make your changes
6. Run tests: `npm test`
7. Push and open a PR

## What to Contribute

- **Bug fixes** — Found something broken? Fix it!
- **New token tracking** — Add tokens to `src/types.ts`
- **Better sentiment analysis** — Improve keyword lists or scoring
- **API endpoints** — New query capabilities
- **Documentation** — Clarify, expand, fix typos
- **Tests** — More coverage is always welcome

## Code Style

- TypeScript with strict types
- Express.js for API endpoints
- Anchor/Rust for on-chain programs
- Keep functions small and focused

## Testing

```bash
npm test              # Run all tests
npm run mock          # Generate test data
npm run demo          # Full pipeline test
```

## Project Structure

```
solsentinel/
├── src/              # Source code (TypeScript)
│   ├── api.ts        # REST API server
│   ├── analyzer.ts   # Sentiment analysis engine
│   ├── crawler.ts    # Twitter crawler (Playwright)
│   ├── mockData.ts   # Mock data generator
│   ├── onchain.ts    # Solana client
│   ├── types.ts      # Types, constants, token lists
│   └── uploader.ts   # On-chain data uploader
├── programs/         # Anchor program (Rust)
├── scripts/          # Utility scripts
├── tests/            # Test files
├── data/             # Sentiment data (gitignored)
└── target/           # Build artifacts
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
