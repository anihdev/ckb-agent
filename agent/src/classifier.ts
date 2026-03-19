import { Config } from './config.js';

export type RiskLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface Position {
  owner: string;
  collateral: bigint;  // in shannons
  borrowed: bigint;    // in RUSD units
  ltv: number;         // percentage
  risk: RiskLevel;
}

export function classifyRisk(
  collateral: bigint,
  borrowed: bigint,
  ckbPriceX1000: bigint,
  config: Config
): { ltv: number; risk: RiskLevel } {
  if (collateral === 0n) {
    return { ltv: 100, risk: 'CRITICAL' };
  }

  // Convert collateral from shannons to CKB (1 CKB = 10^8 shannons)
  const collateralCkb = collateral / 100_000_000n;

  // Collateral value in USD (price is x1000, so divide by 1000)
  const collateralUsd = collateralCkb * ckbPriceX1000 / 1000n;

  if (collateralUsd === 0n) {
    return { ltv: 100, risk: 'CRITICAL' };
  }

  // LTV = (borrowed / collateralUsd) * 100
  const ltv = Number(borrowed * 100n / collateralUsd);

  let risk: RiskLevel;
  if (ltv >= config.criticalLtv) {
    risk = 'CRITICAL';
  } else if (ltv >= config.warningLtv) {
    risk = 'WARNING';
  } else {
    risk = 'SAFE';
  }

  return { ltv, risk };
}

export function riskEmoji(risk: RiskLevel): string {
  switch (risk) {
    case 'SAFE':     return '✅ SAFE';
    case 'WARNING':  return '⚠️  WARNING';
    case 'CRITICAL': return '🚨 CRITICAL';
  }
}
