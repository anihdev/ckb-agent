# CKB Position Guardian — Hackathon Submission

## 3. System Design

### Core Architecture

The system has two layers: **on-chain smart contracts** (Rust, RISC-V) that enforce position invariants, and an **off-chain autonomous agent** (TypeScript) that monitors, classifies, and rebalances positions in a continuous loop.

### On-Chain Contracts

```
┌─────────────────────────────────────────────┐
│  collateral-contract (Type Script)          │
│  Cell Data: 24 bytes                        │
│  ┌──────────┬──────────┬──────────────────┐ │
│  │ collat.  │ borrowed │ owner lock hash  │ │
│  │ u64 LE   │ u64 LE   │ u64 LE (8B id)  │ │
│  └──────────┴──────────┴──────────────────┘ │
│  Enforces: LTV <= 80%, min 61 CKB capacity  │
│  Handles: position update + close/repay     │
├─────────────────────────────────────────────┤
│  price-oracle  │  Oracle price cell (stub)  │
│  lock-script   │  Agent spending guard       │
└─────────────────────────────────────────────┘
```

### Agent Loop (Off-Chain)

```
  ┌──────────┐
  │  Config   │ ← .env (RPC URLs, keys, thresholds)
  └────┬─────┘
       ▼
  ┌──────────┐     ┌─────────────────┐
  │  Fetch   │────▶│ CKB Indexer RPC │  (find collateral cells by type script)
  │ positions│◀────│ + Price Oracle   │
  └────┬─────┘     └─────────────────┘
       ▼
  ┌──────────┐
  │ Classify │  LTV = (borrowed / collateral_USD) * 100
  │   risk   │  SAFE < 70% < WARNING < 80% < CRITICAL
  └────┬─────┘
       ▼
  ┌──────────┐     ┌──────────────┐
  │Rebalance │────▶│ Lock Script  │  (enforces maxSpendPerTx)
  │  engine  │     │   check      │
  └────┬─────┘     └──────────────┘
       │
       ├──▶ Record fee (1 CKB per action → fees table)
       ├──▶ Save action to DB (positions table)
       ▼
  ┌──────────┐     ┌────────────────┐
  │ Reporter │────▶│ Terminal + HTML │  (reports/latest.html)
  └────┬─────┘     └────────────────┘
       ▼
  ┌──────────┐
  │  Sleep   │  (interruptible, checks shutdown flag every 1s)
  └──────────┘
       ▼
     loop ↑
```

### Key Flows

**Position Monitoring Flow:**
1. Agent polls CKB indexer for all cells matching the collateral contract's code hash (prefix search)
2. Parses 24-byte cell data into collateral/borrowed/owner fields
3. Fetches current CKB price from the on-chain oracle cell (or falls back to mock)
4. Computes LTV and classifies each position as SAFE / WARNING / CRITICAL

**Rebalancing Flow:**
1. For non-SAFE positions, compute repay amount to bring LTV down to `warningLtv - 10` (target: 60%)
2. Validate repay against `maxSpendPerTx` (lock script spending cap)
3. If valid: execute repayment, record 1 CKB fee, log to SQLite
4. If blocked: log `BLOCKED_BY_LOCK_SCRIPT`, skip action

**Fee Settlement Flow:**
1. Each protective action accrues a 1 CKB fee in the `fees` table
2. Fees accumulate until reaching the 65 CKB settlement threshold (CKB cell minimum)
3. At threshold, fees are eligible for batch settlement to L1 via Fiber Network

**Graceful Shutdown:**
- SIGINT / SIGTERM triggers orderly shutdown: finish current iteration, close DB, exit cleanly
- Sleep is interruptible (1-second ticks checking a shutdown flag)

---

## 4. Setup Environment

### Local Environment

| Component | Version / Details |
|---|---|
| **OS** | Ubuntu (WSL2) on Windows, Linux 6.6.87 |
| **Node.js** | v20.19.6 |
| **TypeScript** | 5.9.3 (ESM, `node16` module resolution) |
| **Runtime** | `node --loader ts-node/esm` (no build step required) |
| **Rust** | Stable + `riscv64imac-unknown-none-elf` target (via Docker) |
| **Capsule** | v0.10.4+ (CKB contract build framework) |
| **Docker** | `nervos/ckb-riscv-gnu-toolchain:focal-20230214` |
| **Database** | SQLite via `better-sqlite3` (local file: `guardian.db`) |
| **Network** | CKB Public Testnet (Pudge) |

### Agent Stack

| Dependency | Purpose |
|---|---|
| `@ckb-ccc/core` ^1.9.0 | CKB transaction building, signing, cell queries (replaces Lumos) |
| `better-sqlite3` ^12.6.2 | Local persistence for position history, run metadata, fee tracking |
| `dotenv` ^17.3.1 | Environment variable loading from `.env` |
| `ts-node` ^10.9.2 | TypeScript execution without pre-compilation |

### Smart Contract Stack

| Dependency | Purpose |
|---|---|
| `ckb-std` | CKB VM syscalls (cell loading, script access, error handling) |
| `ckb-testtool` | Local transaction verification without a running node |
| Capsule | Build orchestration for RISC-V contract binaries |

---

## 5. Tooling

### CKB On-Chain Elements

- **Collateral Contract (Type Script):** Custom RISC-V smart contract that enforces position invariants on-chain. Validates 24-byte cell data layout, enforces 80% max LTV, verifies minimum 61 CKB cell capacity. Handles both position updates (output cell exists) and close/repay operations (no output cell). Deployed to testnet at TX `0x402b...`.

- **Price Oracle Contract:** On-chain price cell storing CKB/USD price as a 24-byte payload (price x1000 + timestamp + sequence, all u64 LE). The agent reads this cell to compute real-time collateral valuations. Deployed to testnet at TX `0x41ae...`.

- **Lock Script (Agent Spending Guard):** Enforces a per-transaction spending cap (`maxSpendPerTx`) on the agent's rebalancing actions. Prevents the agent from draining positions beyond a configurable limit. Deployed to testnet at TX `0xf412...`.

### CKB Infrastructure & Tooling

- **CKB Indexer RPC:** Used via `client.findCells()` with prefix-matching on type scripts to discover all collateral position cells on-chain. The agent uses `scriptSearchMode: "prefix"` to match any position under the collateral contract code hash.

- **CCC Library (`@ckb-ccc/core`):** Common Chains Connector — the primary SDK for transaction construction, signing (`SignerCkbPrivateKey`), cell queries, and RPC communication. Chosen over Lumos for its cleaner ESM support and modern API.

- **Cell Data Encoding:** Both on-chain (Rust `read_u64`) and off-chain (TypeScript `readU64LE`) use the same 24-byte little-endian layout. The contract and agent must stay in sync on this format.

- **Deploy Pipeline:** Custom `deploy.ts` script reads compiled RISC-V binaries from `contracts/build/release/`, creates data cells on testnet, and outputs TX hashes. Supports idempotent deploys (skip already-deployed contracts) and `--force` flag for intentional redeployment.

### Fiber Network (Fee Settlement Layer)

- The agent accumulates 1 CKB fees per protective action in a local `fees` table
- Fees batch to L1 at a 65 CKB threshold (CKB cell minimum capacity constraint)
- Settlement is designed around Fiber Network for off-chain batching before on-chain finalization

---

## 6. Current Functionality

### Autonomous Position Monitoring
The agent runs a continuous poll-classify-act loop. On each iteration it queries the CKB indexer for all cells matching the collateral contract's type script, parses the 24-byte cell data, and computes each position's LTV using real-time price data from the on-chain oracle.

### Risk Classification Engine
Positions are classified into three tiers based on configurable thresholds:
- **SAFE** (LTV < 70%): No action needed
- **WARNING** (70% <= LTV < 80%): Agent computes and simulates a repayment to bring LTV to 60%
- **CRITICAL** (LTV >= 80%): Immediate rebalancing triggered with highest priority

### Rebalancing with Lock Script Guard
When a position exceeds the safe threshold, the rebalancer computes the exact RUSD repayment needed to bring LTV down to `warningLtv - 10` (default 60%). Before executing, it validates the repay amount against the lock script's `maxSpendPerTx` cap — preventing the agent from spending beyond its authorized limit in a single transaction.

### On-Chain Contract Enforcement
The collateral contract (Rust, RISC-V) provides the hard safety net:
- Rejects any position update where LTV exceeds 80%
- Validates the 24-byte data format on every cell mutation
- Enforces minimum 61 CKB cell capacity
- Handles both update and close/repay paths

### Fee Tracking and Batch Settlement
Each protective action records a 1 CKB fee. Fees accumulate in SQLite until reaching the 65 CKB threshold (minimum CKB cell capacity), at which point they're eligible for batch settlement via Fiber Network.

### Persistent Audit Trail
All position snapshots, agent actions, and run metadata are recorded in SQLite (`guardian.db`):
- `positions` table: Every position check with LTV, risk level, and action taken
- `agent_runs` table: Per-iteration metadata (positions checked, actions simulated, error count)
- `fees` table: Fee accrual and settlement status

### Live Dashboard
Each iteration produces a terminal snapshot and an HTML report (`reports/latest.html`) with color-coded position cards, LTV gauges, and rebalancing action details.

### Simulation Mode
Running with `--simulate` lets the full pipeline execute without broadcasting transactions on-chain — useful for testing, demos, and dry runs.

### Idempotent Contract Deployment
The deploy script (`deploy.ts`) checks existing env vars before deploying, supports `--force` for intentional redeployment, and outputs ready-to-paste `.env` lines. Testnet seeding scripts (`seed.ts`, `seed-one.ts`, `set-price.ts`) create sample positions and oracle data for end-to-end testing.

---

## 7. Future Functionality

### Multi-Asset Collateral
Extend the 24-byte cell data format to support multiple collateral types (e.g., CKB + sUDT tokens). The classifier and rebalancer would compute composite LTV across a basket of assets.

### Real Price Oracle Integration
Replace the stub oracle with a decentralized price feed (e.g., Band Protocol or a CKB-native oracle network). Add staleness checks (reject prices older than N blocks) and multi-source aggregation.

### Fiber Network Live Settlement
Complete the Fiber Network integration for fee settlement — open payment channels, batch micro-fees off-chain, and settle to L1 periodically. This would dramatically reduce on-chain fee overhead.

### Liquidation Auctions
When a position crosses a liquidation threshold (e.g., 90% LTV) and the borrower hasn't responded, trigger an on-chain Dutch auction for the collateral. The agent would orchestrate the auction lifecycle.

### Multi-Agent Coordination
Run multiple guardian agents with different risk appetites and strategies. A coordination layer (on-chain or via Fiber) would prevent duplicate actions and allow agents to bid on protection rights.

### Historical Analytics and Alerting
Build a web dashboard on top of the SQLite audit trail — historical LTV trends, action frequency, fee revenue. Add webhook/email alerts when positions approach critical thresholds.

### Cross-Chain Position Monitoring
Extend the agent to monitor CDPs on other UTXO chains via CCC's multi-chain support, creating a unified risk management layer across Nervos ecosystem chains.

---

## 8. Product Viability

### The Problem is Real
Collateralized debt positions are the backbone of DeFi lending (MakerDAO, Aave, Compound). Liquidation failures cost protocols hundreds of millions — the March 2020 "Black Thursday" saw MakerDAO lose $8.3M from failed liquidations. Any lending protocol on CKB will need automated position monitoring.

### Why CKB is Uniquely Suited
CKB's Cell Model makes this architecture more robust than EVM alternatives:
- **Type scripts as invariant enforcers:** The collateral contract can reject invalid state transitions at the VM level, not just via external keeper bots racing for MEV
- **Lock scripts as spending guards:** The agent's spending authority is cryptographically bounded on-chain, not just by a multisig or governance vote
- **Cell data as structured storage:** The 24-byte position format is self-contained in each cell, enabling efficient indexer queries without contract state reads

### Revenue Model
The 1 CKB per-action fee model (batched at 65 CKB via Fiber) creates sustainable agent economics:
- Operators earn fees proportional to protective actions taken
- The 65 CKB batching threshold aligns with CKB's cell capacity constraint
- As positions scale, fee revenue scales linearly with monitoring activity

### Path to Production
1. **Testnet (current):** Core loop proven with deployed contracts and seeded positions
2. **Mainnet pilot:** Partner with a CKB lending protocol to run alongside their existing liquidation infrastructure
3. **Multi-protocol:** Generalize the agent to monitor any CKB-based CDP, not just the custom collateral contract
4. **Infrastructure product:** Offer Position Guardian as a hosted service (monitoring-as-a-service) for CKB DeFi protocols that don't want to run their own keepers

### Competitive Advantage
Unlike EVM keeper bots that compete in mempool priority auctions (MEV), CKB's cell model allows the guardian agent to operate with on-chain spending authority and guaranteed invariant enforcement. The agent doesn't race against other bots — it operates within a cryptographically defined scope set by the lock script.
