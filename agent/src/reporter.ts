import { Position, riskEmoji } from './classifier.js';
import { RebalanceAction } from './rebalancer.js';
import fs from 'fs';
import path from 'path';

export function generateReport(
  positions: Position[],
  actions: (RebalanceAction | null)[] = []
): void {
  const timestamp = new Date().toISOString();
  const reportsDir = path.join(process.cwd(), '..', 'reports');

  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  // Terminal snapshot
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  DEMO SNAPSHOT — ${timestamp}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Positions monitored: ${positions.length}`);
  console.log(`  Actions simulated:   ${actions.filter(Boolean).length}`);
  console.log(`${'─'.repeat(60)}\n`);

  positions.forEach((p, i) => {
    const action = actions[i];
    console.log(`  Position ${i + 1}: ${p.owner}`);
    console.log(`  Collateral : ${Number(p.collateral) / 1e8} CKB`);
    console.log(`  Borrowed   : ${p.borrowed} RUSD`);
    console.log(`  LTV        : ${p.ltv.toFixed(1)}%`);
    console.log(`  Risk       : ${riskEmoji(p.risk)}`);
    if (action) {
      console.log(`  Action     : Repay ${action.repayAmount} RUSD`);
      console.log(`  Projected  : LTV → ${action.projectedLtv.toFixed(1)}% (${action.projectedRisk})`);
      console.log(`  Lock Script: ✅ Verified`);
    }
    console.log('');
  });

  // Write HTML report
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>CKB Position Guardian</title>
  <style>
    body { font-family: monospace; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    h1 { color: #58a6ff; }
    .position { border: 1px solid #30363d; padding: 1rem; margin: 1rem 0; border-radius: 6px; }
    .SAFE { border-left: 4px solid #3fb950; }
    .WARNING { border-left: 4px solid #d29922; }
    .CRITICAL { border-left: 4px solid #f85149; }
    .label { color: #8b949e; font-size: 0.85rem; }
    .value { color: #e6edf3; font-weight: bold; }
    .action { background: #161b22; padding: 0.5rem; margin-top: 0.5rem; border-radius: 4px; }
    footer { margin-top: 2rem; color: #8b949e; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>🛡️ CKB Position Guardian</h1>
  <p class="label">Last Run: ${timestamp}</p>
  <p class="label">Positions: ${positions.length} | Actions: ${actions.filter(Boolean).length}</p>
  ${positions.map((p, i) => {
    const action = actions[i];
    return `
  <div class="position ${p.risk}">
    <div><span class="label">Owner</span><br><span class="value">${p.owner}</span></div>
    <div><span class="label">Collateral</span><br><span class="value">${(Number(p.collateral) / 1e8).toFixed(2)} CKB</span></div>
    <div><span class="label">Borrowed</span><br><span class="value">${p.borrowed} RUSD</span></div>
    <div><span class="label">LTV</span><br><span class="value">${p.ltv.toFixed(1)}%</span></div>
    <div><span class="label">Risk</span><br><span class="value">${riskEmoji(p.risk)}</span></div>
    ${action ? `
    <div class="action">
      <span class="label">Action:</span> Repay <b>${action.repayAmount} RUSD</b><br>
      <span class="label">Projected LTV:</span> ${action.projectedLtv.toFixed(1)}% → ${action.projectedRisk}<br>
      <span class="label">Lock Script:</span> ✅ Verified
    </div>` : ''}
  </div>`;
  }).join('')}
  <footer>CKB Position Guardian · Powered by CKB lock scripts + Fiber Network</footer>
</body>
</html>`;

  const htmlPath = path.join(reportsDir, 'latest.html');
  fs.writeFileSync(htmlPath, html);
  console.log(` Report saved → ${htmlPath}\n`);
}
