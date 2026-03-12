import { RiskClassifier } from './classifier';
import { PositionFetcher } from './fetcher';
import { RebalanceEngine } from './rebalancer';
import { ReportGenerator } from './reporter';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  console.log(`[${new Date().toISOString()}] CKB Position Guardian starting...`);

  while (true) {
    console.log(`[${new Date().toISOString()}] Polling positions...`);

    const positions = await PositionFetcher.fetch(config);
    
    for (const position of positions) {
      const risk = RiskClassifier.classify(position, config);
      console.log(`[${new Date().toISOString()}] Position: ${position.collateral} CKB / ${position.borrowed} RUSD | LTV: ${position.ltv}% | ${risk}`);

      if (risk !== 'SAFE') {
        await RebalanceEngine.simulate(position, config);
      }
    }

    ReportGenerator.generate(positions);
    await sleep(config.risk.poll_interval_seconds * 1000);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);