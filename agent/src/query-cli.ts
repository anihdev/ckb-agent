import dotenv from 'dotenv';
import { initDb, closeDb } from './db.js';
import { answerTelegramQuery } from './query-handler.js';

dotenv.config();

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const query = args.join(' ').trim();

  return {
    query,
    warningLtv: parseInt(process.env.WARNING_LTV || '70', 10),
    criticalLtv: parseInt(process.env.CRITICAL_LTV || '80', 10),
    simulate: process.env.SIMULATE === 'true' || process.argv.includes('--simulate'),
    bootstrapPath: process.env.TELEGRAM_BOOTSTRAP_PATH || '../../BOOTSTRAP.md',
  };
}

async function main() {
  const { query, warningLtv, criticalLtv, simulate, bootstrapPath } = parseArgs(process.argv);

  if (!query) {
    console.error('Usage: node --loader ts-node/esm src/query-cli.ts "what are the current positions?"');
    process.exit(1);
  }

  initDb();

  try {
    const answer = await answerTelegramQuery(query, {
      warningLtv,
      criticalLtv,
      simulate,
      bootstrapPath,
      fiberRpcUrl: process.env.FIBER_RPC_URL,
    });
    process.stdout.write(`${answer}\n`);
  } finally {
    closeDb();
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
