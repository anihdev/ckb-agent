import axios from 'axios';

let botToken: string | null = null;
let chatId: string | null = null;

export function initTelegram(token: string, chat: string) {
  botToken = token;
  chatId = chat;
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
