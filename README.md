# CKB Position Guardian

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
7. **Settles** a 1 CKB fee per protective action instantly via Fiber micropayment (or batches to L1 as fallback)
8. **Generates** a timestamped DEMO SNAPSHOT and HTML report
9. **Shuts down gracefully** on SIGINT/SIGTERM — closes SQLite cleanly, logs iteration count

---

## Why CKB

### Lock Scripts as Agent Permission Boundaries
Every spend the agent makes is validated against a lock script that encodes:
- **Max spend per transaction** — the agent physically cannot exceed this, even if compromised
- **Whitelisted contract addresses** — the agent can only interact with approved protocols
- **Signature verification** — every agent action requires a valid witness

This is architecturally impossible on most blockchains. On Solana, a rogue agent can drain a wallet. On CKB, it cannot.

### Fiber Network for Micropayment Fees
The agent settles fees instantly via Fiber Network payment channels when a local Fiber node is running — each 1 CKB fee is sent off-chain via `send_payment` the moment a protective action occurs. When Fiber is unavailable, fees fall back to batch accumulation on L1 at the 65 CKB cell minimum threshold. This dual-path design means the agent works with or without Fiber infrastructure.

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
        ├── fees.ts                   # Fiber-first fee settlement with L1 fallback
        ├── fiber.ts                  # Fiber Network micropayment channel integration
        ├── db.ts                     # SQLite position history + audit trail
        └── demo-connection.ts        # Proves live testnet connectivity
```

---

## Full Setup and deploy instructions.

### System Requirements
- Ubuntu 20.04+ or WSL2 on Windows (tested on Ubuntu 24 / WSL2)
- 4GB RAM minimum
- Internet connection (VPN recommended for some ISPs — see Troubleshooting)

### Step 1 — System Dependencies

```bash
sudo apt update
sudo apt install -y curl git build-essential pkg-config libssl-dev
```

### Step 2 — Node.js v20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # v20.x.x
npm --version
```

### Step 3 — Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version   # 1.70+
```

Add the CKB RISC-V target:

```bash
rustup target add riscv64imac-unknown-none-elf
rustup target list --installed | grep riscv
# riscv64imac-unknown-none-elf
```

### Step 4 — Capsule

```bash
cargo install ckb-capsule
capsule --version   # Capsule 0.10.x
```

### Step 5 — Cross (optional — needed for full RISC-V builds)

```bash
cargo install cross

# Optional: install Docker for full cross-compilation
sudo apt install docker.io -y
sudo systemctl start docker
sudo usermod -aG docker $USER
# Close and reopen terminal after usermod
```

> Without Docker, `cross` falls back to host compilation. This works for testnet builds.

### Step 6 — Clone and Install

```bash
git clone https://github.com/anihdev/ckb-agent
cd ckb-agent/agent
npm install
```

### Step 7 — Configure Environment

```bash
cp .env.example .env
nano .env
```

Required fields:

```env
CKB_RPC_URL=https://testnet.ckb.dev/rpc
CKB_INDEXER_URL=https://testnet.ckb.dev/indexer
AGENT_PRIVATE_KEY=0x...          # generated in Step 8
COLLATERAL_CONTRACT_TX_HASH=     # filled after deploy
COLLATERAL_CODE_HASH=            # filled after deploy
PRICE_ORACLE_TX_HASH=            # filled after deploy
LOCK_SCRIPT_TX_HASH=             # filled after deploy
POLL_INTERVAL_SECONDS=300
MAX_SPEND_PER_TX=100000000000
WARNING_LTV=70
CRITICAL_LTV=80
FIBER_RPC_URL=http://127.0.0.1:8227   # optional — Fiber node for instant fee settlement
```

### Step 8 — Generate Agent Wallet

```bash
cd ~/ckb-agent/agent
node --loader ts-node/esm - << 'EOF'
import { ccc } from "@ckb-ccc/core";
const client = new ccc.ClientPublicTestnet();
const key = ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32)));
const signer = new ccc.SignerCkbPrivateKey(client, key);
const address = await signer.getRecommendedAddress();
console.log("AGENT_PRIVATE_KEY=" + key);
console.log("AGENT_ADDRESS=" + address);
EOF
```

Copy `AGENT_PRIVATE_KEY` into `.env`.

### Step 9 — Fund Agent Wallet

1. Copy `AGENT_ADDRESS` from above
2. Visit https://faucet.nervos.org
3. Paste address, claim CKB

Verify:

```bash
node --loader ts-node/esm - << 'EOF'
import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv"; dotenv.config();
const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL });
const signer = new ccc.SignerCkbPrivateKey(client, process.env.AGENT_PRIVATE_KEY);
const bal = await signer.getBalance();
console.log("Balance:", Number(bal)/1e8, "CKB");
EOF
```

### Step 10 — Build Contracts

```bash
cd ~/ckb-agent/contracts
capsule build --release
ls build/release/
# collateral-contract  lock-script  price-oracle
```

### Step 11 — Deploy Contracts

```bash
cd ~/ckb-agent/agent
npm run deploy
```

Copy the three TX hashes printed into `.env`:

```env
COLLATERAL_CONTRACT_TX_HASH=0x...
PRICE_ORACLE_TX_HASH=0x...
LOCK_SCRIPT_TX_HASH=0x...
COLLATERAL_CODE_HASH=0x...       # also printed by deploy
```

Then deploy the price data cell:

```bash
npm run set-price
# Copy PRICE_ORACLE_TX_HASH from output into .env (replaces the contract TX hash)
```

### Step 12 — Seed Test Positions

```bash
npm run seed
```

Creates three positions:
- 12,000 CKB / 40 RUSD → **SAFE** (LTV ~22%)
- 5,000 CKB / 55 RUSD → **WARNING** (LTV ~73%)
- 3,000 CKB / 72 RUSD → **CRITICAL** (LTV ~160%)

### Step 13 — Verify Live Connection

```bash
npm run demo-connection
```

Expected:
```
✅ Connected to CKB Testnet
✅ Price Oracle — $0.015 per CKB
✅ Collateral Contract
✅ Lock Script
   Total positions found: 3
✅ All systems operational
```

### Step 14 — Run the Agent

```bash
# Live mode
npm run start

# Simulate mode (no transactions sent)
npm run simulate
```

Stop with `Ctrl+C` — shuts down gracefully.

---

## Available Scripts

| Script | Purpose |
|---|---|
| `npm run start` | Run agent in live mode |
| `npm run simulate` | Run agent in simulate mode |
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

Explorer: https://pudge.explorer.nervos.org/transaction/0x402b4eed3167018ff92d1dd12cfe2baefbfb33c7fad06895817cd7690ac8fe11

---

## Stack

| Layer | Technology |
|---|---|
| On-chain contracts | Rust, CKB-VM (RISC-V), ckb-std 0.15.3 |
| Contract scaffolding | Capsule 0.10.4 |
| Off-chain agent | TypeScript 5.9, Node.js v20 |
| CKB SDK | @ckb-ccc/core (replaces deprecated Lumos) |
| Data persistence | SQLite (better-sqlite3) |
| HTTP client | axios (Fiber RPC calls) |
| Fee settlement | Fiber Network (micropayment channels) with L1 batch fallback |
| Network | CKB Testnet (Pudge) |

---

## Conventions

### Emoji Usage

Emojis in this project are **intentional visual indicators**, not decoration:

| Emoji | Meaning |
|-------|---------|
| 🛡️ | Guardian agent branding |
| ✅ | `SAFE` - position is healthy |
| ⚠️ | `WARNING` - position approaching risk threshold |
| 🚨 | `CRITICAL` - position requires immediate action |

These appear in logs, reports, terminal output, and documentation by design.

---

## Security Design

- Lock script **rejects transactions** exceeding `max_spend_per_tx` at consensus level
- Lock script **rejects transactions** to non-whitelisted contracts
- Price oracle **rejects updates** with > 50% price jump (manipulation guard)
- Price oracle **rejects replayed updates** via sequence number
- Agent **falls back to mock data** gracefully on network failure — never crashes
- Agent **closes database cleanly** on SIGINT/SIGTERM — no corruption on server restart

---

## Business Model

Pay-per-protection. 1 CKB per protective action. When a Fiber node is running, fees settle instantly via off-chain micropayment. Otherwise, fees batch on L1 at the 65 CKB cell minimum threshold. If nothing happens, nothing is charged.