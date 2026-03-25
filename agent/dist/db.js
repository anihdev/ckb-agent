import Database from 'better-sqlite3';
import path from 'path';
let db;
export function getDb() {
    if (!db)
        throw new Error('Database not initialized — call initDb() first');
    return db;
}
export function initDb() {
    const dbPath = path.join(process.cwd(), 'guardian.db');
    db = new Database(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner         TEXT NOT NULL,
      collateral    TEXT NOT NULL,
      borrowed      TEXT NOT NULL,
      ltv           REAL NOT NULL,
      risk          TEXT NOT NULL,
      action_taken  TEXT NOT NULL DEFAULT 'NONE',
      timestamp     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  INTEGER NOT NULL,
      positions_checked INTEGER DEFAULT 0,
      actions_simulated INTEGER DEFAULT 0,
      errors      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner       TEXT NOT NULL,
      amount_ckb  TEXT NOT NULL,
      action      TEXT NOT NULL,
      settled     INTEGER DEFAULT 0,
      fiber_settled INTEGER DEFAULT 0,
      timestamp   INTEGER NOT NULL
    );
  `);
    // Keep older databases compatible with Fiber settlement tracking.
    const feeColumns = db.prepare(`PRAGMA table_info(fees)`).all();
    if (!feeColumns.some(column => column.name === 'fiber_settled')) {
        db.exec(`ALTER TABLE fees ADD COLUMN fiber_settled INTEGER DEFAULT 0`);
    }
    console.log(`[DB] Initialized at ${dbPath}`);
}
export function savePosition(record) {
    const stmt = db.prepare(`
    INSERT INTO positions (owner, collateral, borrowed, ltv, risk, action_taken, timestamp)
    VALUES (@owner, @collateral, @borrowed, @ltv, @risk, @action_taken, @timestamp)
  `);
    stmt.run(record);
}
export function getPositionHistory(owner, limit = 10) {
    return db.prepare(`
    SELECT * FROM positions WHERE owner = ? ORDER BY timestamp DESC LIMIT ?
  `).all(owner, limit);
}
export function saveRun(run) {
    db.prepare(`
    INSERT INTO agent_runs (started_at, positions_checked, actions_simulated, errors)
    VALUES (@started_at, @positions_checked, @actions_simulated, @errors)
  `).run(run);
}
export function closeDb() {
    if (db) {
        db.close();
        console.log('[DB] Connection closed');
    }
}
