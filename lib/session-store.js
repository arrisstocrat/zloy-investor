import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SESSION_SECONDS = 24 * 60 * 60;
let sqlite;

export function storageAvailable() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ||
    !process.env.VERCEL && process.env.INVESTOR_DB_PATH);
}

function keyFor(token) {
  return 'zloy-investor:round:v1:' + createHash('sha256').update(token).digest('hex');
}

function localStore() {
  if (sqlite) return sqlite;
  const path = process.env.INVESTOR_DB_PATH;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  sqlite = new DatabaseSync(path);
  sqlite.exec(`
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rounds_expiry ON rounds(expires_at);
  `);
  return sqlite;
}

async function redis(...command) {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io')) {
    throw Error('Unexpected Redis endpoint');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw Error('Redis status ' + response.status);
  const data = await response.json();
  if (data.error || !Object.hasOwn(data, 'result')) throw Error('Redis command failed');
  return data.result;
}

const COMPARE_AND_SET = `
  local old = redis.call('GET', KEYS[1])
  if not old or cjson.decode(old).revision ~= tonumber(ARGV[1]) then return 0 end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
`;

export async function readSession(token) {
  const key = keyFor(token);
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const value = await redis('GET', key);
    return value === null ? null : JSON.parse(value);
  }
  const db = localStore();
  const now = Date.now();
  db.prepare('DELETE FROM rounds WHERE expires_at <= ?').run(now);
  const row = db.prepare('SELECT state FROM rounds WHERE id = ?').get(key);
  return row ? JSON.parse(row.state) : null;
}

export async function writeSession(token, state, previousRevision = null) {
  const key = keyFor(token);
  const value = JSON.stringify(state);
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (previousRevision === null) return await redis('SET', key, value, 'NX', 'EX', SESSION_SECONDS) === 'OK';
    return await redis('EVAL', COMPARE_AND_SET, 1, key, previousRevision, value, SESSION_SECONDS) === 1;
  }
  const db = localStore();
  const now = Date.now();
  const expiry = now + SESSION_SECONDS * 1000;
  if (previousRevision === null) {
    db.prepare('DELETE FROM rounds WHERE expires_at <= ?').run(now);
    return db.prepare('INSERT OR IGNORE INTO rounds VALUES (?, ?, ?, ?)')
      .run(key, state.revision, expiry, value).changes === 1;
  }
  return db.prepare('UPDATE rounds SET revision = ?, expires_at = ?, state = ? WHERE id = ? AND revision = ? AND expires_at > ?')
    .run(state.revision, expiry, value, key, previousRevision, now).changes === 1;
}
