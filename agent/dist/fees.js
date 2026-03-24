import Database from 'better-sqlite3';
import path from 'path';
import { sendFiberPayment, checkFiberAvailable } from './fiber.js';
const FEE_PER_ACTION_CKB = 1n;
const FEE_PER_ACTION_SHANNONS = 100000000n;
const SETTLEMENT_THRESHOLD_CKB = 65n;
let db;
function getDb() {
    if (!db) {
        db = new Database(path.join(process.cwd(), 'guardian.db'));
        db.exec(`
      CREATE TABLE IF NOT EXISTS fees (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        owner         TEXT NOT NULL,
        amount_ckb    TEXT NOT NULL,
        action        TEXT NOT NULL,
        settled       INTEGER DEFAULT 0,
        fiber_settled INTEGER DEFAULT 0,
        timestamp     INTEGER NOT NULL
      );
    `);
    }
    return db;
}
export async function recordAndSettleFee(owner, action, fiberRpcUrl) {
    const database = getDb();
    // Try Fiber first - instant settlement, no threshold
    if (fiberRpcUrl) {
        const fiberAvailable = await checkFiberAvailable(fiberRpcUrl);
        if (fiberAvailable) {
            const success = await sendFiberPayment(fiberRpcUrl, FEE_PER_ACTION_SHANNONS, `Guardian fee: ${action}`);
            if (success) {
                database.prepare(`
          INSERT INTO fees (owner, amount_ckb, action, settled, fiber_settled, timestamp)
          VALUES (?, ?, ?, 0, 1, ?)
        `).run(owner, FEE_PER_ACTION_CKB.toString(), action, Date.now());
                console.log(`[FEES] ✅ 1 CKB fee settled instantly via Fiber`);
                return;
            }
        }
    }
    // Fallback - batch accumulation toward L1 threshold
    database.prepare(`
    INSERT INTO fees (owner, amount_ckb, action, settled, fiber_settled, timestamp)
    VALUES (?, ?, ?, 0, 0, ?)
  `).run(owner, FEE_PER_ACTION_CKB.toString(), action, Date.now());
    console.log(`[FEES] Recorded ${FEE_PER_ACTION_CKB} CKB fee for: ${action}`);
}
// Keep legacy recordFee for backward compatibility
export function recordFee(owner, action) {
    const database = getDb();
    database.prepare(`
    INSERT INTO fees (owner, amount_ckb, action, settled, fiber_settled, timestamp)
    VALUES (?, ?, ?, 0, 0, ?)
  `).run(owner, FEE_PER_ACTION_CKB.toString(), action, Date.now());
    console.log(`[FEES] Recorded ${FEE_PER_ACTION_CKB} CKB fee for: ${action}`);
}
export function getPendingFees() {
    const database = getDb();
    const records = database.prepare(`SELECT * FROM fees WHERE settled = 0 AND fiber_settled = 0`).all();
    const fiberCount = database.prepare(`SELECT COUNT(*) as count FROM fees WHERE fiber_settled = 1`).get();
    const total = records.reduce((sum, r) => sum + BigInt(r.amount_ckb), 0n);
    return { total, count: records.length, fiberSettled: fiberCount.count };
}
export function checkSettlementReady() {
    const { total, count, fiberSettled } = getPendingFees();
    if (total >= SETTLEMENT_THRESHOLD_CKB) {
        return { ready: true, totalCkb: total, count, message: `✅ Ready to settle: ${total} CKB (${count} actions) — L1 threshold met` };
    }
    const remaining = SETTLEMENT_THRESHOLD_CKB - total;
    return { ready: false, totalCkb: total, count, message: `Accumulating: ${total}/${SETTLEMENT_THRESHOLD_CKB} CKB (${remaining} until L1 settlement) | ${fiberSettled} settled via Fiber` };
}
export function markFeesSettled(txHash) {
    const database = getDb();
    database.prepare(`UPDATE fees SET settled = 1 WHERE settled = 0 AND fiber_settled = 0`).run();
    console.log(`[FEES] ✅ Batch fees settled on L1. TX: ${txHash}`);
}
export function printFeeStatus() {
    const settlement = checkSettlementReady();
    console.log(`\n[FEES] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[FEES] Pending:    ${settlement.totalCkb} CKB (${settlement.count} actions)`);
    console.log(`[FEES] Settlement: ${settlement.message}`);
    console.log(`[FEES] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
