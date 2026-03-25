import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';

export interface QueryHandlerConfig {
  warningLtv: number;
  criticalLtv: number;
  simulate: boolean;
  bootstrapPath: string;
}

interface PositionRow {
  owner: string;
  collateral: string;
  borrowed: string;
  ltv: number;
  risk: string;
  action_taken: string;
  timestamp: number;
}

interface RunRow {
  started_at: number;
  positions_checked: number;
  actions_simulated: number;
  errors: number;
}

function shortOwner(owner: string): string {
  return owner.length > 18 ? `${owner.slice(0, 18)}...` : owner;
}

function formatCkb(collateral: string): string {
  return `${(Number(collateral) / 1e8).toFixed(0)} CKB`;
}

function formatPosition(position: PositionRow, index: number): string {
  const action = position.action_taken && position.action_taken !== 'NONE'
    ? ` | ${position.action_taken}`
    : '';
  return `Position ${index + 1}: ${shortOwner(position.owner)} | ${formatCkb(position.collateral)} collateral | ${position.borrowed} RUSD borrowed | LTV ${position.ltv.toFixed(1)}% | ${position.risk}${action}`;
}

function getLatestPositions(): PositionRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.owner, p.collateral, p.borrowed, p.ltv, p.risk, p.action_taken, p.timestamp
    FROM positions p
    INNER JOIN (
      SELECT owner, MAX(timestamp) AS max_timestamp
      FROM positions
      GROUP BY owner
    ) latest
      ON latest.owner = p.owner
     AND latest.max_timestamp = p.timestamp
    ORDER BY p.ltv DESC, p.owner ASC
  `).all() as PositionRow[];
}

function getAtRiskPositions(): PositionRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.owner, p.collateral, p.borrowed, p.ltv, p.risk, p.action_taken, p.timestamp
    FROM positions p
    INNER JOIN (
      SELECT owner, MAX(timestamp) AS max_timestamp
      FROM positions
      GROUP BY owner
    ) latest
      ON latest.owner = p.owner
     AND latest.max_timestamp = p.timestamp
    WHERE p.risk IN ('WARNING', 'CRITICAL')
    ORDER BY p.ltv DESC, p.owner ASC
  `).all() as PositionRow[];
}

function getLatestTimestamp(): number | null {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(timestamp) AS latest FROM positions`).get() as { latest: number | null };
  return row?.latest ?? null;
}

function getRecentActions(sinceTimestamp: number): PositionRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT owner, collateral, borrowed, ltv, risk, action_taken, timestamp
    FROM positions
    WHERE timestamp >= ?
      AND action_taken != 'NONE'
    ORDER BY timestamp DESC
  `).all(sinceTimestamp) as PositionRow[];
}

function getLatestRun(): RunRow | null {
  const db = getDb();
  return db.prepare(`
    SELECT started_at, positions_checked, actions_simulated, errors
    FROM agent_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).get() as RunRow | undefined ?? null;
}

function resolveBootstrapPath(rawPath: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function readBootstrapSummary(bootstrapPath: string): string | null {
  const resolved = resolveBootstrapPath(bootstrapPath);
  if (!fs.existsSync(resolved)) return null;

  const content = fs.readFileSync(resolved, 'utf8');
  const heading = content.split('\n').find(line => line.startsWith('# '));
  if (!heading) return null;
  return `${heading.replace(/^#\s+/, '').trim()} | Source: ${resolved}`;
}

function helpText(config: QueryHandlerConfig): string {
  const bootstrapSummary = readBootstrapSummary(config.bootstrapPath);
  const lines = [
    '🛡️ CKB Guardian Query Help',
    '',
    'Ask:',
    '- what are the current positions?',
    '- is anything at risk?',
    '- how many actions today?',
    '- what is your status?',
    '- tell me about the project',
    '',
    `Mode: ${config.simulate ? 'SIMULATE' : 'LIVE'}`,
    `Thresholds: WARNING at ${config.warningLtv}% | CRITICAL at ${config.criticalLtv}%`,
  ];

  if (bootstrapSummary) {
    lines.push(`Bootstrap: ${bootstrapSummary}`);
  }

  return lines.join('\n');
}

function handleCurrentPositions(): string {
  const positions = getLatestPositions();
  if (positions.length === 0) {
    return '🛡️ No positions found in `guardian.db` yet.';
  }

  return [
    '🛡️ Current Positions',
    '',
    ...positions.map(formatPosition),
    '',
    'Source: SQLite `guardian.db` -> `positions`',
  ].join('\n');
}

function handleRiskStatus(): string {
  const positions = getAtRiskPositions();
  if (positions.length === 0) {
    return '✅ No WARNING or CRITICAL positions found in the latest snapshots.\n\nSource: SQLite `guardian.db` -> `positions`';
  }

  return [
    '🚨 At-Risk Positions',
    '',
    ...positions.map((position, index) => {
      const recommended = position.risk === 'CRITICAL'
        ? 'Recommended action: simulate immediate repay toward ~60% LTV'
        : 'Recommended action: simulate repay before crossing CRITICAL';
      return `${formatPosition(position, index)}\n${recommended}`;
    }),
    '',
    'Source: SQLite `guardian.db` -> `positions`',
  ].join('\n');
}

function handleActionsToday(): string {
  const since = Date.now() - 86_400_000;
  const actions = getRecentActions(since);
  if (actions.length === 0) {
    return '🛡️ No rebalance actions recorded in the last 24 hours.\n\nSource: SQLite `guardian.db` -> `positions`';
  }

  return [
    `🛡️ Actions in the Last 24 Hours: ${actions.length}`,
    '',
    ...actions.map((action, index) => `${index + 1}. ${shortOwner(action.owner)} | ${action.action_taken} | ${new Date(action.timestamp).toISOString()}`),
    '',
    'Source: SQLite `guardian.db` -> `positions`',
  ].join('\n');
}

function handleStatus(config: QueryHandlerConfig): string {
  const latestTimestamp = getLatestTimestamp();
  const latestRun = getLatestRun();
  const latestPositions = getLatestPositions();

  return [
    '🛡️ CKB Guardian Status',
    '',
    `I am running on CKB Testnet, autonomously monitoring ${latestPositions.length} collateral positions.`,
    '',
    'Poll Interval: Every 5 minutes',
    `Mode: ${config.simulate ? 'Simulate' : 'Live'}`,
    `Database: SQLite at ${path.join(process.cwd(), 'guardian.db')}`,
    '',
    'Current Protection:',
    `- ${latestPositions.length} positions tracked`,
    `- LTV thresholds enforced: WARNING at ${config.warningLtv}%, CRITICAL at ${config.criticalLtv}%`,
    '- Lock scripts: Enforcing spend limits at blockchain consensus level',
    '- Fiber Network: Fee settlement integration ready',
    latestRun ? `- Last run: checked ${latestRun.positions_checked}, actions ${latestRun.actions_simulated}, errors ${latestRun.errors}` : '- Last run: no run metadata yet',
    '',
    `Last Updated: ${latestTimestamp ? new Date(latestTimestamp).toISOString() : 'No position snapshots yet'}`,
    '',
    'Source: SQLite `guardian.db` -> `positions`, `agent_runs`',
  ].join('\n');
}

function handleProject(): string {
  return [
    '🛡️ CKB Position Guardian',
    '',
    '- Event: Claw & Order: CKB AI Agent Hackathon (March 2026)',
    '- Repository: https://github.com/anihdev/ckb-agent',
    '- Architecture: Smart contracts (Rust) + TypeScript agent + Telegram integration',
    '- Innovation: Lock scripts enforce spending limits at blockchain consensus level',
    '- Fee Settlement: Fiber Network micropayment channels for instant settlement',
    '',
    'Deployed Contracts (CKB Testnet):',
    '- Collateral Contract: 0x402b4eed3167018ff92d1dd12cfe2baefbfb33c7fad06895817cd7690ac8fe11',
    '- Price Oracle: 0x41ae343b70b74a46d543376204812f68f5f147164fa92b0efc52e0c1ca243544',
    '- Lock Script: 0xf4129d0a27e59a1ba863ca75d75a56a9875785ced568fd00050aea60634821b1',
    '',
    'Explorer:',
    'https://pudge.explorer.nervos.org/transaction/0x402b4eed3167018ff92d1dd12cfe2baefbfb33c7fad06895817cd7690ac8fe11',
  ].join('\n');
}

export function answerTelegramQuery(message: string, config: QueryHandlerConfig): string {
  const normalized = message.trim().toLowerCase();

  if (!normalized || normalized === '/start' || normalized === '/help') {
    return helpText(config);
  }

  if (normalized.includes('current positions') || normalized.includes('positions')) {
    return handleCurrentPositions();
  }

  if (
    normalized.includes('at risk') ||
    normalized.includes('in danger') ||
    normalized.includes('risk status') ||
    normalized.includes('warning') ||
    normalized.includes('critical')
  ) {
    return handleRiskStatus();
  }

  if (
    normalized.includes('actions today') ||
    normalized.includes('what did you do') ||
    normalized.includes('how many actions')
  ) {
    return handleActionsToday();
  }

  if (normalized.includes('status') || normalized.includes('are you running')) {
    return handleStatus(config);
  }

  if (
    normalized.includes('project') ||
    normalized.includes('github') ||
    normalized.includes('hackathon')
  ) {
    return handleProject();
  }

  return [
    "I didn't match that query to a built-in report yet.",
    '',
    helpText(config),
  ].join('\n');
}
