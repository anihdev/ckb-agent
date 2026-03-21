import { riskEmoji } from './classifier.js';
import { fetchPositions } from './fetcher.js';
import { rebalance, RebalanceAction } from './rebalancer.js';
import { generateReport } from './reporter.js';
import { loadConfig } from './config.js';
import { initDb, closeDb, saveRun } from './db.js';
import { printFeeStatus } from './fees.js';
import { printFiberStatus } from './fiber.js';

let iterationCount = 0;
let isShuttingDown = false;

function setupShutdownHandlers() {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[${new Date().toISOString()}] 🛑 Received ${signal} — shutting down gracefully...`);
    console.log(`[${new Date().toISOString()}] Total iterations completed: ${iterationCount}`);
    try {
      closeDb();
      console.log(`[${new Date().toISOString()}] ✅ Database closed cleanly`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ⚠️  Error closing DB:`, e);
    }
    console.log(`[${new Date().toISOString()}] CKB Position Guardian stopped.`);
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error(`[${new Date().toISOString()}] ❌ Uncaught exception:`, err);
    shutdown('uncaughtException');
  });
}

async function main() {
  const config = loadConfig();
  initDb();
  setupShutdownHandlers();

  console.log(`[${new Date().toISOString()}] 🛡️  CKB Position Guardian starting...`);
  console.log(`[${new Date().toISOString()}] Mode: ${config.simulate ? 'SIMULATE' : 'LIVE'}`);
  console.log(`[${new Date().toISOString()}] Poll interval: ${config.pollIntervalSeconds}s`);
  console.log(`[${new Date().toISOString()}] Max spend per tx: ${config.maxSpendPerTx} shannons`);

  while (!isShuttingDown) {
    iterationCount++;
    console.log(`\n[${new Date().toISOString()}] ── Iteration #${iterationCount} ──`);

    const startedAt = Date.now();
    let positionsChecked = 0;
    let actionsSimulated = 0;
    let errors = 0;

    try {
      const positions = await fetchPositions(config);
      positionsChecked = positions.length;
      const actions: (RebalanceAction | null)[] = [];

      for (const position of positions) {
        console.log(
          `[${new Date().toISOString()}] ${position.owner} | ` +
          `${(Number(position.collateral) / 1e8).toFixed(0)} CKB / ${position.borrowed} RUSD | ` +
          `LTV: ${position.ltv.toFixed(1)}% | ${riskEmoji(position.risk)}`
        );

        if (position.risk !== 'SAFE') {
          const action = await rebalance(position, config);
          actions.push(action);
          if (action?.executed) actionsSimulated++;
        } else {
          actions.push(null);
        }
      }

      generateReport(positions, actions);
      printFeeStatus();
      await printFiberStatus(config.fiberRpcUrl);

    } catch (err) {
      errors++;
      console.error(`[${new Date().toISOString()}] ❌ Error in iteration #${iterationCount}:`, err);
    }

    saveRun({ started_at: startedAt, positions_checked: positionsChecked, actions_simulated: actionsSimulated, errors });

    // Interruptible sleep — checks shutdown flag every second
    for (let i = 0; i < config.pollIntervalSeconds && !isShuttingDown; i++) {
      await sleep(1000);
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
