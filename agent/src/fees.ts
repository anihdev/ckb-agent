import Database from 'better-sqlite3';
import path from 'path';

const FEE_PER_ACTION_CKB = 1n;           // 1 CKB per protective action
const SETTLEMENT_THRESHOLD_CKB = 65n;    // CKB cell minimum — batch until this

interface FeeRecord {
  id?: number;
  owner: string;
  amount_ckb: string;
  action: string;
  settled: number;
  timestamp: number;
}

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(process.cwd(), 'guardian.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS fees (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        owner       TEXT NOT NULL,
        amount_ckb  TEXT NOT NULL,
        action      TEXT NOT NULL,
        settled     INTEGER DEFAULT 0,
        timestamp   INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export function recordFee(owner: string, action: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO fees (owner, amount_ckb, action, settled, timestamp)
    VALUES (?, ?, ?, 0, ?)
  `).run(owner, FEE_PER_ACTION_CKB.toString(), action, Date.now());

  console.log(`[FEES] Recorded ${FEE_PER_ACTION_CKB} CKB fee for action: ${action}`);
}

export function getPendingFees(): { total: bigint; count: number; records: FeeRecord[] } {
  const database = getDb();
  const records = database.prepare(`
    SELECT * FROM fees WHERE settled = 0 ORDER BY timestamp ASC
  `).all() as FeeRecord[];

  const total = records.reduce((sum, r) => sum + BigInt(r.amount_ckb), 0n);
  return { total, count: records.length, records };
}

export function checkSettlementReady(): {
  ready: boolean;
  totalCkb: bigint;
  count: number;
  message: string;
} {
  const { total, count } = getPendingFees();

  if (total >= SETTLEMENT_THRESHOLD_CKB) {
    return {
      ready: true,
      totalCkb: total,
      count,
      message: `✅ Ready to settle: ${total} CKB accumulated (${count} actions) — threshold met`,
    };
  }

  const remaining = SETTLEMENT_THRESHOLD_CKB - total;
  return {
    ready: false,
    totalCkb: total,
    count,
    message: `⏳ Accumulating: ${total}/${SETTLEMENT_THRESHOLD_CKB} CKB (${remaining} CKB until settlement)`,
  };
}

export function markFeesSettled(txHash: string): void {
  const database = getDb();
  database.prepare(`
    UPDATE fees SET settled = 1 WHERE settled = 0
  `).run();
  console.log(`[FEES] ✅ Fees settled on-chain. TX: ${txHash}`);
}

export function printFeeStatus(): void {
  const { total, count } = getPendingFees();
  const settlement = checkSettlementReady();

  console.log(`\n[FEES] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[FEES] Pending fees: ${total} CKB (${count} actions)`);
  console.log(`[FEES] Settlement:   ${settlement.message}`);
  console.log(`[FEES] Strategy:     Fiber Network (batch to L1 at 65 CKB threshold)`);
  console.log(`[FEES] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
