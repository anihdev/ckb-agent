import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';
import { getFiberStatus } from './fiber.js';
const SNAPSHOT_WINDOW_MS = 60000;
function shortOwner(owner) {
    return owner.length > 18 ? `${owner.slice(0, 18)}...` : owner;
}
function formatCkb(collateral) {
    return `${(Number(collateral) / 1e8).toFixed(0)} CKB`;
}
function formatRisk(risk) {
    switch (risk) {
        case 'CRITICAL':
            return '🚨 CRITICAL';
        case 'WARNING':
            return '⚠️ WARNING';
        case 'SAFE':
            return '✅ SAFE';
        default:
            return risk;
    }
}
function formatAction(action) {
    if (!action || action === 'NONE')
        return 'NONE';
    return action
        .replace(/^REPAY_?/i, 'Repay ')
        .replace(/_RUSD$/i, ' RUSD')
        .replace(/_/g, ' ');
}
function formatPosition(position, index) {
    const action = position.action_taken && position.action_taken !== 'NONE'
        ? `\nAction: ${formatAction(position.action_taken)}`
        : '';
    return [
        `Position ${index + 1}: ${shortOwner(position.owner)}`,
        `Collateral: ${formatCkb(position.collateral)}`,
        `Borrowed: ${position.borrowed} RUSD`,
        `LTV: ${position.ltv.toFixed(1)}%`,
        `Risk: ${formatRisk(position.risk)}${action}`,
    ].join('\n');
}
function getLatestSnapshotTimestamp() {
    const db = getDb();
    const row = db.prepare(`SELECT MAX(timestamp) AS latest FROM positions`).get();
    return row?.latest ?? null;
}
function getSnapshotPositions(filterClause = '') {
    const db = getDb();
    const latestTimestamp = getLatestSnapshotTimestamp();
    if (!latestTimestamp)
        return [];
    const cutoff = latestTimestamp - SNAPSHOT_WINDOW_MS;
    return db.prepare(`
    SELECT p.owner, p.collateral, p.borrowed, p.ltv, p.risk, p.action_taken, p.timestamp
    FROM positions p
    INNER JOIN (
      SELECT owner, MAX(timestamp) AS max_timestamp
      FROM positions
      WHERE timestamp >= ?
      GROUP BY owner
    ) latest
      ON latest.owner = p.owner
     AND latest.max_timestamp = p.timestamp
    WHERE p.timestamp >= ?
    ${filterClause}
    ORDER BY p.ltv DESC, p.owner ASC
  `).all(cutoff, cutoff);
}
function getLatestPositions() {
    return getSnapshotPositions();
}
function getAtRiskPositions() {
    return getSnapshotPositions(`AND p.risk IN ('WARNING', 'CRITICAL')`);
}
function getSafePositions() {
    return getSnapshotPositions(`AND p.risk = 'SAFE'`).sort((a, b) => a.ltv - b.ltv || a.owner.localeCompare(b.owner));
}
function getLatestTimestamp() {
    return getLatestSnapshotTimestamp();
}
function getRecentActions(sinceTimestamp) {
    const db = getDb();
    return db.prepare(`
    SELECT owner, collateral, borrowed, ltv, risk, action_taken, timestamp
    FROM positions
    WHERE timestamp >= ?
      AND action_taken != 'NONE'
    ORDER BY timestamp DESC
  `).all(sinceTimestamp);
}
function getLatestRun() {
    const db = getDb();
    return db.prepare(`
    SELECT started_at, positions_checked, actions_simulated, errors
    FROM agent_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).get() ?? null;
}
function getFeeSummary(sinceTimestamp) {
    const db = getDb();
    const columns = db.prepare(`PRAGMA table_info(fees)`).all();
    const hasFiberSettled = columns.some(column => column.name === 'fiber_settled');
    const query = hasFiberSettled
        ? `
      SELECT COUNT(*) AS total_actions,
             SUM(CASE WHEN fiber_settled = 1 THEN 1 ELSE 0 END) AS fiber_actions
      FROM fees
      WHERE timestamp >= ?
    `
        : `
      SELECT COUNT(*) AS total_actions,
             0 AS fiber_actions
      FROM fees
      WHERE timestamp >= ?
    `;
    const row = db.prepare(query).get(sinceTimestamp);
    return {
        total_actions: row?.total_actions ?? 0,
        fiber_actions: row?.fiber_actions ?? 0,
    };
}
function resolveBootstrapPath(rawPath) {
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}
function readBootstrapSummary(bootstrapPath) {
    const resolved = resolveBootstrapPath(bootstrapPath);
    if (!fs.existsSync(resolved))
        return null;
    const content = fs.readFileSync(resolved, 'utf8');
    const heading = content.split('\n').find(line => line.startsWith('# '));
    if (!heading)
        return null;
    return `${heading.replace(/^#\s+/, '').trim()} | Source: ${resolved}`;
}
function helpText(config) {
    const bootstrapSummary = readBootstrapSummary(config.bootstrapPath);
    const lines = [
        '🛡️ CKB Guardian Query Help',
        '',
        'Ask:',
        '- what are the current positions?',
        '- is anything at risk?',
        '- how many actions today?',
        '- what is your status?',
        '- is it connected to fiber yet?',
        '- who are you?',
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
function handleCurrentPositions() {
    const positions = getLatestPositions();
    if (positions.length === 0) {
        return '🛡️ No positions found in `guardian.db` yet.';
    }
    return [
        '🛡️ Current Positions',
        '',
        positions.map(formatPosition).join('\n\n'),
        '',
        'Source: SQLite guardian.db -> positions',
    ].join('\n');
}
function handleRiskStatus() {
    const positions = getAtRiskPositions();
    if (positions.length === 0) {
        return '✅ No WARNING or CRITICAL positions found in the latest snapshots.\n\nSource: SQLite `guardian.db` -> `positions`';
    }
    return [
        '🚨 At-Risk Positions',
        '',
        positions.map((position, index) => {
            const recommended = position.risk === 'CRITICAL'
                ? 'Recommended action: simulate immediate repay toward ~60% LTV'
                : 'Recommended action: simulate repay before crossing CRITICAL';
            return `${formatPosition(position, index)}\n${recommended}`;
        }).join('\n\n'),
        '',
        'Source: SQLite guardian.db -> positions',
    ].join('\n');
}
function handleActionsToday() {
    const since = Date.now() - 86400000;
    const actions = getRecentActions(since);
    const feeSummary = getFeeSummary(since);
    if (actions.length === 0) {
        return '🛡️ No rebalance actions recorded in the last 24 hours.\n\nSource: SQLite guardian.db -> positions';
    }
    return [
        `🛡️ Actions in the Last 24 Hours: ${actions.length}`,
        '',
        `Fee records: ${feeSummary.total_actions} total${feeSummary.fiber_actions > 0 ? ` | ${feeSummary.fiber_actions} settled via Fiber` : ' | 0 settled via Fiber'}`,
        '',
        ...actions.slice(0, 10).map((action, index) => `${index + 1}. ${shortOwner(action.owner)} | ${formatAction(action.action_taken)} | ${new Date(action.timestamp).toISOString()}`),
        ...(actions.length > 10 ? [`...and ${actions.length - 10} more action records`] : []),
        '',
        'Source: SQLite guardian.db -> positions, fees',
    ].join('\n');
}
function handleStatus(config) {
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
        'Source: SQLite guardian.db -> positions, agent_runs',
    ].join('\n');
}
function handleHealth(config) {
    return handleStatus(config);
}
async function handleFiberStatus(config) {
    if (config.fiberRpcUrl) {
        const liveStatus = await getFiberStatus(config.fiberRpcUrl);
        if (liveStatus.available) {
            return [
                'Fiber Status',
                '',
                `Node: running${liveStatus.nodeId ? ` (${liveStatus.nodeId.slice(0, 16)}...)` : ''}`,
                liveStatus.channelId
                    ? `Channel: ready | Balance: ${liveStatus.channelBalance ? Number(liveStatus.channelBalance) / 1e8 : 0} CKB`
                    : 'Channel: not ready yet',
                '',
                'Source: live Fiber RPC',
            ].join('\n');
        }
    }
    const since = Date.now() - 86400000;
    const feeSummary = getFeeSummary(since);
    if (feeSummary.fiber_actions > 0) {
        return [
            'Fiber Status',
            '',
            `Fiber settlement is active in the recent fee log.`,
            `Fees settled via Fiber in the last 24 hours: ${feeSummary.fiber_actions}`,
            `Total fee records in the last 24 hours: ${feeSummary.total_actions}`,
            '',
            'Source: SQLite guardian.db -> fees',
        ].join('\n');
    }
    return [
        'Fiber Status',
        '',
        'Fiber integration is configured in the project, but there are no recent fee records marked as settled via Fiber.',
        'That usually means the agent is either using fallback accumulation or Fiber has not completed settlement recently.',
        '',
        'Source: SQLite guardian.db -> fees',
    ].join('\n');
}
function handleIdentity() {
    return [
        '🛡️ I am CKB Guardian.',
        '',
        'I monitor collateralized debt positions on CKB testnet, classify risk, and report simulated protective actions.',
        "Ask me about current positions, risk, actions today, status, Fiber settlement, or the project, and I'll answer from the ckb guardian database.",
    ].join('\n');
}
function handleSafePositions() {
    const positions = getSafePositions();
    if (positions.length === 0) {
        return [
            '✅ Safe Positions',
            '',
            'No SAFE positions are present in the latest position snapshots.',
            '',
            'Source: SQLite guardian.db -> positions',
        ].join('\n');
    }
    return [
        '✅ Safe Positions',
        '',
        positions.map(formatPosition).join('\n\n'),
        '',
        'Source: SQLite guardian.db -> positions',
    ].join('\n');
}
function handleProject() {
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
export async function answerTelegramQuery(message, config) {
    const normalized = message.trim().toLowerCase();
    if (!normalized || normalized === '/start' || normalized === '/help') {
        return helpText(config);
    }
    if (normalized.includes('at risk') ||
        normalized.includes('in danger') ||
        normalized.includes('risk status') ||
        normalized.includes('warning') ||
        normalized.includes('critical')) {
        return handleRiskStatus();
    }
    if (normalized.includes('safe position') || normalized.includes('safe positions')) {
        return handleSafePositions();
    }
    if (normalized.includes('current positions') || normalized.includes('positions')) {
        return handleCurrentPositions();
    }
    if (normalized.includes('actions today') ||
        normalized.includes('what did you do') ||
        normalized.includes('how many actions')) {
        return handleActionsToday();
    }
    if (normalized.includes('status') || normalized.includes('are you running')) {
        return handleStatus(config);
    }
    if (normalized === 'health' || normalized.includes('health')) {
        return handleHealth(config);
    }
    if (normalized.includes('project') ||
        normalized.includes('github') ||
        normalized.includes('hackathon')) {
        return handleProject();
    }
    if (normalized.includes('fiber')) {
        return handleFiberStatus(config);
    }
    if (normalized.includes('who are you') ||
        normalized.includes('what do you do') ||
        normalized === 'who are you' ||
        normalized === 'what you do') {
        return handleIdentity();
    }
    return [
        "I didn't match that query to a built-in report yet.",
        '',
        helpText(config),
    ].join('\n');
}
