import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  ckbRpcUrl: string;
  ckbIndexerUrl: string;
  agentPrivateKey: string;
  collateralContractTxHash: string;
  collateralCodeHash: string;
  priceOracleTxHash: string;
  lockScriptTxHash: string;
  pollIntervalSeconds: number;
  maxSpendPerTx: bigint;
  warningLtv: number;
  criticalLtv: number;
  simulate: boolean;
  fiberRpcUrl: string;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  telegramBootstrapPath: string;
  telegramDemoMode: boolean;
}

export function loadConfig(): Config {
  const required = [
    'CKB_RPC_URL',
    'CKB_INDEXER_URL',
    'AGENT_PRIVATE_KEY',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    ckbRpcUrl: process.env.CKB_RPC_URL!,
    ckbIndexerUrl: process.env.CKB_INDEXER_URL!,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY!,
    collateralContractTxHash: process.env.COLLATERAL_CONTRACT_TX_HASH || '',
    collateralCodeHash: process.env.COLLATERAL_CODE_HASH || '',
    priceOracleTxHash: process.env.PRICE_ORACLE_TX_HASH || '',
    lockScriptTxHash: process.env.LOCK_SCRIPT_TX_HASH || '',
    pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '300'),
    maxSpendPerTx: BigInt(process.env.MAX_SPEND_PER_TX || '100000000000'),
    warningLtv: parseInt(process.env.WARNING_LTV || '70'),
    criticalLtv: parseInt(process.env.CRITICAL_LTV || '80'),
    fiberRpcUrl: process.env.FIBER_RPC_URL || "http://127.0.0.1:8227",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
    telegramBootstrapPath: process.env.TELEGRAM_BOOTSTRAP_PATH || '../../BOOTSTRAP.md',
    telegramDemoMode: process.env.TELEGRAM_DEMO_MODE === 'true',
    simulate: process.argv.includes('--simulate'),
  };
}
