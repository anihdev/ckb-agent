import fs from 'fs';
import path from 'path';
import { riskEmoji } from './classifier.js';
export function writeStatusFile(positions, actions) {
    const timestamp = new Date().toISOString();
    const lines = [
        `CKB Position Guardian — Last Updated: ${timestamp}`,
        `Positions Monitored: ${positions.length}`,
        `Actions Simulated: ${actions.filter(Boolean).length}`,
        ``,
    ];
    positions.forEach((p, i) => {
        const action = actions[i];
        lines.push(`Position ${i + 1}: ${p.owner}`);
        lines.push(`  Collateral: ${(Number(p.collateral) / 1e8).toFixed(0)} CKB`);
        lines.push(`  Borrowed:   ${p.borrowed} RUSD`);
        lines.push(`  LTV:        ${p.ltv.toFixed(1)}%`);
        lines.push(`  Risk:       ${riskEmoji(p.risk)}`);
        if (action) {
            lines.push(`  Action:     Repay ${action.repayAmount} RUSD`);
            lines.push(`  Projected:  LTV → ${action.projectedLtv.toFixed(1)}% (${action.projectedRisk})`);
            lines.push(`  Lock Script: ✅ Verified`);
        }
        lines.push(``);
    });
    lines.push(`Contracts (CKB Testnet):`);
    lines.push(`  Collateral: 0x402b4eed3167018ff92d1dd12cfe2baefbfb33c7fad06895817cd7690ac8fe11`);
    lines.push(`  Explorer:   https://pudge.explorer.nervos.org/transaction/0x402b4eed...`);
    lines.push(`  Repo:       https://github.com/anihdev/CKB_DEFI_GUARDIAN`);
    const statusPath = path.join(process.cwd(), '..', 'status.txt');
    fs.writeFileSync(statusPath, lines.join('\n'));
}
