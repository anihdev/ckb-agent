# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CKB Position Guardian — a smart contract + agent system for managing collateralized debt positions (CDPs) on the Nervos CKB blockchain. The agent monitors positions and triggers rebalancing when loan-to-value (LTV) ratios approach unsafe levels.

## Repository Layout

- `contracts/` — Rust smart contracts built with the Capsule framework (has its own Cargo workspace)
- `agent/` — TypeScript agent that polls the chain, classifies risk, and rebalances positions
- `src/` — Root-level Rust library stub (minimal)

## Commands

### Smart Contracts (run from `contracts/`)

```bash
cd contracts
capsule build          # Build all contracts (RISC-V target)
capsule test           # Run contract tests
```

Contracts compile to `riscv64imac-unknown-none-elf` via Docker image `nervos/ckb-riscv-gnu-toolchain:focal-20230214`. Requires Docker and Capsule v0.10.4+.

### Agent (run from `agent/`)

```bash
cd agent
npm install
npx tsc                                          # Type-check / compile
node --loader ts-node/esm src/index.ts           # Run agent (main loop)
node --loader ts-node/esm src/index.ts --simulate  # Simulate mode (no on-chain txs)
node --loader ts-node/esm src/deploy.ts          # Deploy contracts to testnet
node --loader ts-node/esm src/seed.ts            # Create sample positions on-chain
node --loader ts-node/esm src/seed-one.ts        # Create a single CRITICAL position
node --loader ts-node/esm src/set-price.ts       # Set oracle price cell on-chain
```

The agent is ESM (`"type": "module"` in package.json). All local imports must use `.js` extensions (e.g., `import { foo } from './bar.js'`). Use `node --loader ts-node/esm` instead of `npx ts-node` for running scripts.

## Architecture

### Smart Contracts (`contracts/contracts/`)

**collateral-contract** is the core contract. It stores position data in a cell's 24-byte data field:

| Bytes | Field |
|-------|-------|
| 0–8   | Collateral amount (CKB shannons, u64 LE) |
| 8–16  | Borrowed amount (RUSD units, u64 LE) |
| 16–24 | Owner lock hash (8-byte identifier, u64 LE) |

Validation logic (`entry.rs`):
- Owner identifier from script args (minimum 8 bytes)
- Max LTV enforced at 80%: `(borrowed * 100) / collateral <= 80`
- Minimum cell capacity: 61 CKB (6,100,000,000 shannons)
- Handles both position updates (output cell exists) and close/repay (no output cell)

**price-oracle** and **lock-script** are stubs.

### Agent (`agent/src/`)

**Main loop** (`index.ts`): poll → fetch → classify → rebalance → report → sleep.

- `config.ts` — Loads all config from `.env` vars + `--simulate` CLI flag. Required env vars: `CKB_RPC_URL`, `CKB_INDEXER_URL`, `AGENT_PRIVATE_KEY`. Optional: `COLLATERAL_CONTRACT_TX_HASH`, `PRICE_ORACLE_TX_HASH`, `LOCK_SCRIPT_TX_HASH`, `COLLATERAL_CODE_HASH`, `MAX_SPEND_PER_TX`, `WARNING_LTV`, `CRITICAL_LTV`, `POLL_INTERVAL_SECONDS`.
- `fetcher.ts` — Queries on-chain cells via `@ckb-ccc/core` `findCells` (prefix-matching type script by `COLLATERAL_CODE_HASH`). Falls back to hardcoded mock positions when no contract is deployed.
- `classifier.ts` — Computes LTV from collateral value (shannons → CKB × price÷1000) vs borrowed RUSD. Classifies as SAFE / WARNING / CRITICAL based on config thresholds.
- `rebalancer.ts` — Computes repay amounts to bring LTV down to `warningLtv - 10`. Enforces `maxSpendPerTx` lock script check. Records fees and persists actions to SQLite.
- `reporter.ts` — Writes terminal snapshot + `reports/latest.html` with position dashboard.
- `db.ts` — SQLite via `better-sqlite3`. Tables: `positions` (action log), `agent_runs` (run metadata). DB file: `agent/guardian.db`.
- `fees.ts` — Tracks 1 CKB per protective action in a `fees` table. Batches settlement at 65 CKB threshold (CKB cell minimum).
- `deploy.ts` — Deploys compiled contract binaries from `contracts/build/release/` to CKB testnet. Reads binaries, creates data cells, outputs tx hashes for `.env`.
- `seed.ts` / `seed-one.ts` — Creates sample collateral position cells on testnet for testing.
- `set-price.ts` — Creates a price oracle cell (24 bytes: price×1000 + timestamp + sequence).

**Key library:** `@ckb-ccc/core` (not `@ckb-lumos/lumos`) for transaction building, signing, and cell queries. Uses `ccc.ClientPublicTestnet`, `ccc.SignerCkbPrivateKey`, `ccc.Transaction`.

### Configuration

The agent reads configuration from environment variables (`.env` file via `dotenv`). The `agent/config/config.toml` file exists as a reference but is **not parsed** by the agent — all runtime config comes from env vars.

## CKB-Specific Notes

- Contracts run in the CKB VM (RISC-V), so they must be `no_std` Rust.
- Use `ckb-std` for cell loading, script access, and error handling.
- Tests use `ckb-testtool` to build and verify transactions locally without a running node.
- Cell capacity is a hard constraint — always verify positions meet the 61 CKB minimum.
- Position data encoding is always 24 bytes of u64 little-endian values. Both the contract (`read_u64`) and agent (`readU64LE`) use the same layout — keep them in sync.
- Contract errors are `#[repr(i8)]` starting at 10 for custom errors (10=InvalidArgs, 11=InvalidDataSize, 12=LTVExceeded, etc.).
