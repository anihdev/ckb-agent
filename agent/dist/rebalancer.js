import { savePosition } from './db.js';
import { recordAndSettleFee, checkSettlementReady } from './fees.js';
import Database from 'better-sqlite3';
import path from 'path';
function computeRepayAmount(position, targetLtv) {
    const targetBorrowed = position.borrowed * BigInt(targetLtv) / BigInt(position.ltv);
    const repayAmount = position.borrowed - targetBorrowed;
    return repayAmount > 0n ? repayAmount : 1n;
}
function computeProjectedLtv(position, repayAmount) {
    const newBorrowed = position.borrowed - repayAmount;
    if (newBorrowed <= 0n)
        return 0;
    return Number(newBorrowed) * position.ltv / Number(position.borrowed);
}
function wasRecentlyActedOn(owner, withinMinutes = 10) {
    try {
        const db = new Database(path.join(process.cwd(), 'guardian.db'));
        const cutoff = Date.now() - withinMinutes * 60 * 1000;
        const row = db.prepare(`
      SELECT id FROM positions
      WHERE owner = ? AND timestamp > ? AND action_taken != 'NONE'
      LIMIT 1
    `).get(owner, cutoff);
        db.close();
        return !!row;
    }
    catch {
        return false;
    }
}
export async function rebalance(position, config) {
    const targetLtv = config.warningLtv - 10;
    const repayAmount = computeRepayAmount(position, targetLtv);
    const projectedLtv = computeProjectedLtv(position, repayAmount);
    const projectedRisk = projectedLtv >= config.criticalLtv ? 'CRITICAL'
        : projectedLtv >= config.warningLtv ? 'WARNING' : 'SAFE';
    const action = {
        owner: position.owner,
        actionType: 'REPAY',
        repayAmount,
        projectedLtv,
        projectedRisk,
        executed: false,
    };
    const repayInShannons = repayAmount * 1000000n;
    if (repayInShannons > config.maxSpendPerTx) {
        console.log(`[REBALANCER] Blocked by lock script: ${repayInShannons} > max ${config.maxSpendPerTx}`);
        savePosition({
            owner: position.owner,
            collateral: position.collateral.toString(),
            borrowed: position.borrowed.toString(),
            ltv: position.ltv,
            risk: position.risk,
            action_taken: 'BLOCKED_BY_LOCK_SCRIPT',
            timestamp: Date.now(),
        });
        return action;
    }
    if (!config.simulate && wasRecentlyActedOn(position.owner)) {
        console.log(`[REBALANCER] Skipping ${position.owner.slice(0, 12)}... — acted within last 10 minutes`);
        return null;
    }
    const mode = config.simulate ? 'SIMULATE' : 'Simulating';
    console.log(`[REBALANCER] ${mode} — repay ${repayAmount} RUSD`);
    console.log(`[REBALANCER]    Projected LTV: ${projectedLtv.toFixed(1)}% → ${projectedRisk}`);
    console.log(`[REBALANCER]    Lock script check: ${repayInShannons} ≤ ${config.maxSpendPerTx} ✅`);
    action.executed = true;
    // Record fee - tries Fiber first, falls back to batch accumulation if fiber not available
    await recordAndSettleFee(position.owner, `REPAY_${repayAmount}_RUSD`, config.fiberRpcUrl);
    const settlement = checkSettlementReady();
    console.log(`[REBALANCER]    Fee status: ${settlement.message}`);
    savePosition({
        owner: position.owner,
        collateral: position.collateral.toString(),
        borrowed: position.borrowed.toString(),
        ltv: position.ltv,
        risk: position.risk,
        action_taken: `REPAY_${repayAmount}_RUSD`,
        timestamp: Date.now(),
    });
    return action;
}
