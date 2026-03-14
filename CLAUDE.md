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
npx ts-node src/index.ts    # Run agent directly
npx tsc                      # Type-check / compile
```

## Architecture

### Smart Contracts (`contracts/contracts/`)

**collateral-contract** is the core contract. It stores position data in a cell's 24-byte data field:

| Bytes | Field |
|-------|-------|
| 0–8   | Collateral amount (CKB shannons) |
| 8–16  | Borrowed amount (RUSD units) |
| 16–24 | Owner lock hash (8-byte identifier) |

Validation logic (`entry.rs`):
- Owner identifier from script args (minimum 8 bytes)
- Max LTV enforced at 80%: `(borrowed * 100) / collateral <= 80`
- Minimum cell capacity: 61 CKB (6,100,000,000 shannons)
- Handles both position updates (output cell exists) and close/repay (no output cell)

**price-oracle** and **lock-script** are stubs.

### Agent (`agent/src/`)

`index.ts` drives the main loop:
1. `fetcher.ts` — fetches positions from the CKB indexer RPC
2. `classifier.ts` — classifies each position as SAFE / WARNING / CRITICAL
3. `rebalancer.ts` — triggers rebalancing for non-safe positions
4. `reporter.ts` — generates JSON reports

Most agent modules are currently stubs pending implementation.

**Key libraries:** `@ckb-lumos/lumos` v0.23 (transaction building), `axios` (RPC), `better-sqlite3` (state persistence), `dotenv`.

### Configuration (`agent/config/config.toml`)

```toml
[risk]
warning_ltv = 70        # Warning threshold (%)
critical_ltv = 80       # Critical threshold / enforcement limit (%)
poll_interval_seconds = 300

[network]
ckb_rpc = "https://testnet.ckb.dev"
indexer_rpc = "https://testnet.ckb.dev/indexer"
```

## CKB-Specific Notes

- Contracts run in the CKB VM (RISC-V), so they must be `no_std` Rust.
- Use `ckb-std` for cell loading, script access, and error handling.
- Tests use `ckb-testtool` to build and verify transactions locally without a running node.
- Cell capacity is a hard constraint — always verify positions meet the 61 CKB minimum.
