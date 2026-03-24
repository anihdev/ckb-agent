export function classifyRisk(collateral, borrowed, ckbPriceX1000, config) {
    if (collateral === 0n) {
        return { ltv: 100, risk: 'CRITICAL' };
    }
    // Convert collateral from shannons to CKB (1 CKB = 10^8 shannons)
    const collateralCkb = collateral / 100000000n;
    // Collateral value in USD (price is x1000, so divide by 1000)
    const collateralUsd = collateralCkb * ckbPriceX1000 / 1000n;
    if (collateralUsd === 0n) {
        return { ltv: 100, risk: 'CRITICAL' };
    }
    // LTV = (borrowed / collateralUsd) * 100
    const ltv = Number(borrowed * 100n / collateralUsd);
    let risk;
    if (ltv >= config.criticalLtv) {
        risk = 'CRITICAL';
    }
    else if (ltv >= config.warningLtv) {
        risk = 'WARNING';
    }
    else {
        risk = 'SAFE';
    }
    return { ltv, risk };
}
export function riskEmoji(risk) {
    switch (risk) {
        case 'SAFE': return '✅ SAFE';
        case 'WARNING': return '⚠️  WARNING';
        case 'CRITICAL': return '🚨 CRITICAL';
    }
}
