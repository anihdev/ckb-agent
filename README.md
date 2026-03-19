# 🛡️ CKB Position Guardian

**Autonomous DeFi Risk Management Agent on CKB**

> An autonomous AI agent that monitors collateral positions on CKB testnet, computes health factors in real time, classifies risk, and simulates protective repay/rebalance actions — with spending enforced by CKB lock scripts and fees settled via Fiber Network.

---

## What It Does

CKB Position Guardian runs headlessly with no human in the loop. Every 5 minutes it:

1. **Fetches** all open collateral positions from the on-chain contract
2. **Reads** the current CKB price from the on-chain oracle cell
3. **Computes** LTV (loan-to-value ratio) and health factor for each position
4. **Classifies** risk: `✅ SAFE` / `⚠️ WARNING` / `🚨 CRITICAL`
5. **Simulates** exact repay amounts for at-risk positions
6. **Verifies** every action against the lock script's spend limit before executing
7. **Records** a fee per protective action, accumulating toward Fiber Network settlement
8. **Generates** a timestamped DEMO SNAPSHOT and HTML report
9. **Shuts down gracefully** on SIGINT/SIGTERM — closes SQLite cleanly, logs iteration count

---

## Why CKB

This project exploits two properties that make CKB uniquely suited for autonomous agents:

### Lock Scripts as Agent Permission Boundaries
Every spend the agent makes is validated against a lock script that encodes:
- **Max spend per transaction** — the agent physically cannot exceed this, even if compromised
- **Whitelisted contract addresses** — the agent can only interact with approved protocols
- **Signature verification** — every agent action requires a valid witness

This is architecturally impossible on most blockchains. On Solana, a rogue agent can drain a wallet. On CKB, it cannot.

### Fiber Network for Micropayment Fees
Agent fees accumulate off-chain and settle via Fiber Network payment channels — bypassing CKB's 61 CKB cell minimum constraint entirely. This directly addresses the core challenge of CKB micropayments: fees batch until the threshold is met, then settle in a single efficient transaction.

---

## Architecture

```
ckb-agent/
├── contracts/                        # On-chain (Rust / CKB-VM RISC-V)
│   ├── collateral-contract/          # Enforces LTV limits on positions
│   ├── price-oracle/                 # Validates price updates + manipulation guard
│   └── lock-script/                  # Agent permission boundaries (spend limits)
│
└── agent/                            # Off-chain agent (TypeScript)
    └── src/
        ├── index.ts                  # Main loop — polls every 5 min, graceful shutdown
        ├── config.ts                 # Loads all env config + risk thresholds
        ├── fetcher.ts                # Reads positions + price (reuses RPC client)
        ├── classifier.ts             # Computes LTV + risk classification
        ├── rebalancer.ts             # Simulates repay actions + lock script check
        ├── reporter.ts               # Generates terminal snapshot + HTML report
        ├── fees.ts                   # Accumulates fees toward Fiber settlement
        ├── db.ts                     # SQLite position history + audit trail
        └── demo-connection.ts        # Proves live testnet connectivity for judges
```

---

## Live Demo Output

```
🔗 CKB Position Guardian — Live Testnet Connection Demo

✅ Connected to CKB Testnet
   Tip block: #541,411,332

📊 Verifying deployed contracts:
   ✅ Price Oracle    — TX: 0x93b70247...
      CKB Price: $0.015 per CKB
   ✅ Collateral Contract — TX: 0x402b4eed...
   ✅ Lock Script     — TX: 0xf4129d0a...

💳 Agent Wallet:
   Balance: 77,208.00 CKB

📋 Scanning for collateral positions...
   Position 1: 3000 CKB collateral / 72 RUSD borrowed
   Position 2: 12000 CKB collateral / 40 RUSD borrowed
   Position 3: 5000 CKB collateral / 55 RUSD borrowed
   Total positions found: 3

✅ All systems operational — CKB Position Guardian is live on testnet
```

---

## Agent Run Snapshot

```
[2026-03-15T04:58:21Z] 🛡️  CKB Position Guardian starting...
[2026-03-15T04:58:21Z] Mode: LIVE | Poll: 300s | Max spend: 100000000000 shannons

── Iteration #1 ──
[FETCHER] Oracle price: $0.015 per CKB
[FETCHER] Found position: 3000 CKB / 72 RUSD  → 🚨 CRITICAL
[REBALANCER] Simulating repay: 45 RUSD
[REBALANCER]    Projected LTV: 59.2% → SAFE
[REBALANCER]    Lock script check: 45000000 ≤ 100000000000 ✅
[FEES]  Accumulating: 4/65 CKB until Fiber settlement

[FETCHER] Found position: 12000 CKB / 40 RUSD → ✅ SAFE
[FETCHER] Found position: 5000 CKB / 55 RUSD  → ⚠️  WARNING
[REBALANCER] Simulating repay: 10 RUSD → LTV: 59.1% (SAFE) ✅

📄 Report saved → /reports/latest.html

^C
[2026-03-15T05:03:21Z] 🛑 Received SIGINT — shutting down gracefully...
[2026-03-15T05:03:21Z] Total iterations completed: 1
[2026-03-15T05:03:21Z] ✅ Database closed cleanly
```

---

## Stack

| Layer | Technology |
|---|---|
| On-chain contracts | Rust, CKB-VM (RISC-V), ckb-std |
| Contract scaffolding | Capsule |
| Off-chain agent | TypeScript, Node.js |
| CKB SDK | @ckb-ccc/core (active, replaces deprecated Lumos) |
| Data persistence | SQLite (better-sqlite3) |
| Fee settlement | Fiber Network (micropayment channels) |
| Deployment | CKB Testnet |

---

## Setup

### Prerequisites
- Node.js v18+
- Rust + `riscv64imac-unknown-none-elf` target
- Capsule (`cargo install ckb-capsule`)
- OpenSSL dev headers (`sudo apt install pkg-config libssl-dev`)
- CKB testnet wallet with funds (claim from Nervos Pudge Faucet)

### Install

```bash
git clone https://github.com/anihdev/ckb-agent
cd ckb-agent/agent
npm install
cp .env.example .env
# Fill in AGENT_PRIVATE_KEY and contract hashes
```

### Build Contracts

```bash
cd contracts
capsule build --release
```

### Deploy Contracts

```bash
cd agent
npm run deploy
# Copy TX hashes into .env
```

### Seed Test Positions

```bash
npm run seed
```

### Verify Live Connection

```bash
npm run demo-connection
```

### Run Agent

```bash
# Live mode
npm run start

# Simulate mode (no transactions sent)
npm run simulate
```

---

## Available Scripts

| Script | Purpose |
|---|---|
| `npm run start` | Run agent in live mode |
| `npm run simulate` | Run agent in simulate mode (no txs) |
| `npm run deploy` | Deploy contracts to testnet |
| `npm run seed` | Create test positions on-chain |
| `npm run set-price` | Deploy price data cell |
| `npm run demo-connection` | Prove live testnet connectivity |

---

## Deployed Contracts (CKB Testnet)

| Contract | TX Hash |
|---|---|
| Collateral Contract | `0x402b4eed3167018ff92d1dd12cfe2baefbfb33c7fad06895817cd7690ac8fe11` |
| Price Oracle | `0x41ae343b70b74a46d543376204812f68f5f147164fa92b0efc52e0c1ca243544` |
| Lock Script | `0xf4129d0a27e59a1ba863ca75d75a56a9875785ced568fd00050aea60634821b1` |
| Price Data Cell | `0x93b70247afe4a4393e476c9d00d04e7b7ad924da8cd75f4ca5c5dae5508e66de` |

View on explorer: https://pudge.explorer.nervos.org/transaction/0x402b4eed3167018ff92d1dd12cfe2baefbfb33c7fad06895817cd7690ac8fe11

---

## Configuration

```env
CKB_RPC_URL=https://testnet.ckb.dev/rpc
AGENT_PRIVATE_KEY=0x...
COLLATERAL_CONTRACT_TX_HASH=0x...
COLLATERAL_CODE_HASH=0x...
PRICE_ORACLE_TX_HASH=0x...
LOCK_SCRIPT_TX_HASH=0x...
POLL_INTERVAL_SECONDS=300
MAX_SPEND_PER_TX=100000000000
WARNING_LTV=70
CRITICAL_LTV=80
```

---

## Micropayment Fee Architecture

CKB's cell model requires a minimum of 61 CKB per output cell. CKB Position Guardian addresses this directly:

- Every protective action records a **1 CKB fee credit** in the local database
- The agent tracks cumulative fees against the **65 CKB settlement threshold**
- When threshold is reached, fees batch and settle via **Fiber Network** in one transaction
- Users pay only when capital is actively protected — zero fees if nothing happens

This approach is documented in the CKB community's research on the cell minimum constraint (Nervos Talk, March 2026).

---

## Business Model

Pay-per-protection. 1 CKB per protective action. Fees settle via Fiber Network at threshold. If nothing happens, nothing is charged. For DAOs and larger users, thresholds and fee parameters are fully configurable.

---

## Security Design

The agent operates within hard constraints enforced on-chain:

- Lock script **rejects transactions** that exceed `max_spend_per_tx`
- Lock script **rejects transactions** to non-whitelisted contracts
- Price oracle **rejects updates** with > 50% price jump (manipulation guard)
- Price oracle **rejects replayed updates** via sequence number
- Agent falls back to mock data gracefully on network failure — never crashes

---

## Team

Built for the Claw & Order: CKB AI Agent Hackathon (March 2026)
Repository: https://github.com/anihdev/ckb-agent
