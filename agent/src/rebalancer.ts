import { Config } from './config.js';
import { Position } from './classifier.js';
import { savePosition } from './db.js';
import { recordAndSettleFee, checkSettlementReady } from './fees.js';

export interface RebalanceAction {
  owner: string;
  actionType: 'REPAY' | 'CLOSE';
  repayAmount: bigint;
  projectedLtv: number;
  projectedRisk: string;
  executed: boolean;
}

function computeRepayAmount(position: Position, targetLtv: number): bigint {
  const targetBorrowed = position.borrowed * BigInt(targetLtv) / BigInt(position.ltv);
  const repayAmount = position.borrowed - targetBorrowed;
  return repayAmount > 0n ? repayAmount : 1n;
}

function computeProjectedLtv(position: Position, repayAmount: bigint): number {
  const newBorrowed = position.borrowed - repayAmount;
  if (newBorrowed <= 0n) return 0;
  return Number(newBorrowed) * position.ltv / Number(position.borrowed);
}

export async function rebalance(position: Position, config: Config): Promise<RebalanceAction | null> {
  const targetLtv = config.warningLtv - 10;
  const repayAmount = computeRepayAmount(position, targetLtv);
  const projectedLtv = computeProjectedLtv(position, repayAmount);
  const projectedRisk = projectedLtv >= config.criticalLtv ? 'CRITICAL'
    : projectedLtv >= config.warningLtv ? 'WARNING' : 'SAFE';

  const action: RebalanceAction = {
    owner: position.owner,
    actionType: 'REPAY',
    repayAmount,
    projectedLtv,
    projectedRisk,
    executed: false,
  };

  const repayInShannons = repayAmount * 1_000_000n;
  if (repayInShannons > config.maxSpendPerTx) {
    console.log(`[REBALANCER] ⛔ Blocked by lock script: ${repayInShannons} > max ${config.maxSpendPerTx}`);
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

  const mode = config.simulate ? '🔵 SIMULATE' : '🟡 Simulating';
  console.log(`[REBALANCER] ${mode} — repay ${repayAmount} RUSD`);
  console.log(`[REBALANCER]    Projected LTV: ${projectedLtv.toFixed(1)}% → ${projectedRisk}`);
  console.log(`[REBALANCER]    Lock script check: ${repayInShannons} ≤ ${config.maxSpendPerTx} ✅`);

  action.executed = true;

  // Record fee — tries Fiber first, falls back to batch accumulation
  await recordAndSettleFee(
    position.owner,
    `REPAY_${repayAmount}_RUSD`,
    config.fiberRpcUrl
  );

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
