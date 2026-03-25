import axios from 'axios';
import { answerTelegramQuery, QueryHandlerConfig } from './query-handler.js';

let botToken: string | null = null;
let chatId: string | null = null;
let queryConfig: QueryHandlerConfig | null = null;
let updateOffset = 0;
let pollingStarted = false;

export function initTelegram(token: string, chat: string) {
  botToken = token;
  chatId = chat;
}

export function configureTelegramQueries(config: QueryHandlerConfig) {
  queryConfig = config;
}

export async function sendTelegramMessage(message: string) {
  if (!botToken || !chatId) {
    console.warn('[Telegram] Not configured. Skipping message.');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('[Telegram] Failed to send message:', err instanceof Error ? err.message : err);
  }
}

async function fetchUpdates() {
  if (!botToken) return [];

  const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
  const response = await axios.get(url, {
    params: {
      timeout: 0,
      offset: updateOffset,
      allowed_updates: ['message'],
    },
  });

  if (!response.data?.ok || !Array.isArray(response.data.result)) {
    return [];
  }

  return response.data.result as Array<{
    update_id: number;
    message?: {
      chat?: { id?: number | string };
      text?: string;
    };
  }>;
}

async function handleIncomingUpdates() {
  if (!chatId || !queryConfig) return;

  const updates = await fetchUpdates();
  for (const update of updates) {
    updateOffset = update.update_id + 1;

    const incomingChatId = String(update.message?.chat?.id ?? '');
    const text = update.message?.text?.trim();
    if (!text || incomingChatId !== chatId) continue;

    const reply = await answerTelegramQuery(text, queryConfig);
    await sendTelegramMessage(reply);
  }
}

export function startTelegramPolling() {
  if (pollingStarted || !botToken || !chatId || !queryConfig) return;
  pollingStarted = true;

  const poll = async () => {
    try {
      await handleIncomingUpdates();
    } catch (err) {
      console.error('[Telegram] Failed to poll updates:', err instanceof Error ? err.message : err);
    } finally {
      setTimeout(poll, 5000);
    }
  };

  void poll();
}

export async function notifyIterationStart(iterationCount: number) {
  await sendTelegramMessage(`🛡️ *Iteration #${iterationCount} started*`);
}

export async function notifyPositionUpdate(
  owner: string,
  collateral: string,
  borrowed: string,
  ltv: number,
  riskEmoji: string,
  riskLevel: string
) {
  const ckb = (Number(collateral) / 1e8).toFixed(0);
  const message =
    `${riskEmoji} *Position Update*\n` +
    `Owner: \`${owner}\`\n` +
    `Collateral: ${ckb} CKB\n` +
    `Borrowed: ${borrowed} RUSD\n` +
    `LTV: ${ltv.toFixed(1)}%\n` +
    `Status: *${riskLevel}*`;
  await sendTelegramMessage(message);
}

export async function notifyRebalanceAction(
  owner: string,
  action: string,
  amount: string,
  executed: boolean
) {
  const status = executed ? 'Executed' : 'Simulated';
  const message =
    `*Rebalance Action*\n` +
    `Owner: \`${owner}\`\n` +
    `Action: ${action}\n` +
    `Amount: ${amount}\n` +
    `Status: ${status}`;
  await sendTelegramMessage(message);
}

export async function notifyError(errorMsg: string) {
  const truncated = errorMsg.length > 300 ? errorMsg.substring(0, 300) + '...' : errorMsg;
  await sendTelegramMessage(`🚨 *Error*\n\`\`\`\n${truncated}\n\`\`\``);
}

export async function notifyIterationComplete(
  iterationCount: number,
  positionsChecked: number,
  actionsSimulated: number,
  errors: number,
  durationMs: number
) {
  const durationSec = (durationMs / 1000).toFixed(1);
  const message =
    `✅ *Iteration #${iterationCount} Complete*\n` +
    `Positions checked: ${positionsChecked}\n` +
    `Actions taken: ${actionsSimulated}\n` +
    `Errors: ${errors}\n` +
    `Duration: ${durationSec}s`;
  await sendTelegramMessage(message);
}

export async function notifyFeeUpdate(feesAccumulated: number, fiberStatus: string) {
  const message =
    `*Fee Update*\n` +
    `Accumulated: ${feesAccumulated} shannons\n` +
    `Fiber: ${fiberStatus}`;
  await sendTelegramMessage(message);
}
