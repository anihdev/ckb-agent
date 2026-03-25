import { riskEmoji } from './classifier.js';
import { fetchPositions } from './fetcher.js';
import { rebalance, RebalanceAction } from './rebalancer.js';
import { generateReport } from './reporter.js';
import { loadConfig } from './config.js';
import { initDb, closeDb, savePosition, saveRun } from './db.js';
import { printFeeStatus } from './fees.js';
import { getFiberStatus, printFiberStatus } from './fiber.js';
import { runStartupHealthCheck } from './health.js';
import { configureTelegramQueries, initTelegram, sendTelegramMessage, startTelegramPolling, notifyDemoSnapshot, notifyPositionUpdate, notifyRebalanceAction, notifyError } from './telegram.js';

let iterationCount = 0;
let isShuttingDown = false;
const lastNotifiedRiskState = new Map<string, string>();

function setupShutdownHandlers() {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[${new Date().toISOString()}] Received ${signal} — shutting down gracefully...`);
    console.log(`[${new Date().toISOString()}] Total iterations completed: ${iterationCount}`);
    try {
      await sendTelegramMessage(`🛑 CKB Position Guardian stopped\nSignal: ${signal}\nIterations completed: ${iterationCount}`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ⚠️  Error sending shutdown notice:`, e);
    }
    try {
      closeDb();
      console.log(`[${new Date().toISOString()}] ✅ Database closed cleanly`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ⚠️  Error closing DB:`, e);
    }
    console.log(`[${new Date().toISOString()}] CKB Position Guardian stopped.`);
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('uncaughtException', (err) => {
    console.error(`[${new Date().toISOString()}] Uncaught exception:`, err);
    void shutdown('uncaughtException');
  });
}

async function main() {
  const config = loadConfig();
  initDb();
  setupShutdownHandlers();

  if (config.telegramBotToken && config.telegramChatId) {
    initTelegram(config.telegramBotToken, config.telegramChatId);
    configureTelegramQueries({
      warningLtv: config.warningLtv,
      criticalLtv: config.criticalLtv,
      simulate: config.simulate,
      bootstrapPath: config.telegramBootstrapPath,
      fiberRpcUrl: config.fiberRpcUrl,
    });
    startTelegramPolling();
    await sendTelegramMessage('🛡️ CKB Position Guardian started');
  }

  console.log(`[${new Date().toISOString()}] 🛡️  CKB Position Guardian starting...`);
  console.log(`[${new Date().toISOString()}] Mode: ${config.simulate ? 'SIMULATE' : 'LIVE'}`);
  console.log(`[${new Date().toISOString()}] Poll interval: ${config.pollIntervalSeconds}s`);
  await runStartupHealthCheck(config);
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
      let safeCount = 0;
      let warningCount = 0;
      let criticalCount = 0;

      for (const position of positions) {
        console.log(
          `[${new Date().toISOString()}] ${position.owner} | ` +
          `${(Number(position.collateral) / 1e8).toFixed(0)} CKB / ${position.borrowed} RUSD | ` +
          `LTV: ${position.ltv.toFixed(1)}% | ${riskEmoji(position.risk)}`
        );

        savePosition({
          owner: position.owner,
          collateral: position.collateral.toString(),
          borrowed: position.borrowed.toString(),
          ltv: position.ltv,
          risk: position.risk,
          action_taken: 'NONE',
          timestamp: Date.now(),
        });

        if (position.risk === 'SAFE') safeCount++;
        else if (position.risk === 'WARNING') warningCount++;
        else if (position.risk === 'CRITICAL') criticalCount++;

        if (position.risk !== 'SAFE') {
          const action = await rebalance(position, config);
          actions.push(action);
          const currentRiskState = `${position.risk}:${position.ltv.toFixed(1)}:${position.borrowed.toString()}:${position.collateral.toString()}`;
          const shouldNotifyRisk = lastNotifiedRiskState.get(position.owner) !== currentRiskState;

          if (shouldNotifyRisk) {
            await notifyPositionUpdate(
              position.owner,
              position.collateral.toString(),
              position.borrowed.toString(),
              position.ltv,
              riskEmoji(position.risk),
              position.risk
            );
            lastNotifiedRiskState.set(position.owner, currentRiskState);
          }

          if (action?.executed) {
            actionsSimulated++;
            await notifyRebalanceAction(
              position.owner,
              action.actionType || 'REPAY',
              action.repayAmount?.toString() || '0',
              action.executed
            );
          }
        } else {
          actions.push(null);
        }
      }

      generateReport(positions, actions);
      printFeeStatus();
      await printFiberStatus(config.fiberRpcUrl);

      if (config.telegramBotToken && config.telegramChatId && config.telegramDemoMode) {
        const fiberStatus = await getFiberStatus(config.fiberRpcUrl);
        const fiberLabel = fiberStatus.available
          ? (fiberStatus.channelId ? 'channel ready' : 'node running, channel pending')
          : 'fallback active';

        await notifyDemoSnapshot(
          iterationCount,
          positionsChecked,
          safeCount,
          warningCount,
          criticalCount,
          actionsSimulated,
          fiberLabel
        );
      }

    } catch (err) {
      errors++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[${new Date().toISOString()}] Error in iteration #${iterationCount}:`, err);
      await notifyError(errorMsg);
    }

    saveRun({ started_at: startedAt, positions_checked: positionsChecked, actions_simulated: actionsSimulated, errors });

    // Interruptible sleep - checks shutdown flag every second
    for (let i = 0; i < config.pollIntervalSeconds && !isShuttingDown; i++) {
      await sleep(1000);
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
