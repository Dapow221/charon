import Database from 'better-sqlite3';
import { config } from './config.js';
import type { Alert, TokenCounters, WalletProfile } from './types.js';
import { now } from './utils.js';

export const db = new Database(config.dbPath);

export function initDb(): void {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      signature TEXT NOT NULL,
      mint TEXT NOT NULL,
      wallet TEXT,
      sent_at_ms INTEGER NOT NULL,
      telegram_message_id INTEGER,
      payload_json TEXT NOT NULL,
      UNIQUE(kind, signature, mint, wallet)
    );

    CREATE TABLE IF NOT EXISTS token_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint TEXT NOT NULL,
      kind TEXT NOT NULL,
      signature TEXT NOT NULL,
      wallet TEXT,
      sol_amount REAL,
      at_ms INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE(kind, signature, mint, wallet)
    );

    CREATE TABLE IF NOT EXISTS wallet_profiles (
      address TEXT PRIMARY KEY,
      updated_at_ms INTEGER NOT NULL,
      first_seen_at_ms INTEGER,
      previous_tx_at_ms INTEGER,
      tx_count_before_event INTEGER,
      funding_source TEXT,
      funding_age_hours REAL,
      pnl_usd REAL,
      win_rate REAL,
      profile_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_cache (
      mint TEXT PRIMARY KEY,
      updated_at_ms INTEGER NOT NULL,
      token_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alert_events_mint ON alert_events(mint, sent_at_ms);
    CREATE INDEX IF NOT EXISTS idx_token_events_mint_kind ON token_events(mint, kind, at_ms);
    CREATE INDEX IF NOT EXISTS idx_token_events_wallet ON token_events(wallet, at_ms);
  `);
}

export function seenAlert(alert: Alert): boolean {
  const row = db.prepare(`
    SELECT id FROM alert_events
    WHERE kind = ? AND signature = ? AND mint = ? AND COALESCE(wallet, '') = COALESCE(?, '')
    LIMIT 1
  `).get(alert.kind, alert.signature, alert.mint, alert.wallet) as { id: number } | undefined;
  return Boolean(row);
}

export function storeAlert(alert: Alert, telegramMessageId: number | null): void {
  db.prepare(`
    INSERT OR IGNORE INTO alert_events
      (kind, signature, mint, wallet, sent_at_ms, telegram_message_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    alert.kind,
    alert.signature,
    alert.mint,
    alert.wallet,
    now(),
    telegramMessageId,
    JSON.stringify(alert),
  );
}

export function storeTokenEvent(params: {
  mint: string;
  kind: string;
  signature: string;
  wallet: string | null;
  solAmount: number | null;
  atMs: number;
  payload: unknown;
}): void {
  db.prepare(`
    INSERT OR IGNORE INTO token_events
      (mint, kind, signature, wallet, sol_amount, at_ms, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.mint,
    params.kind,
    params.signature,
    params.wallet,
    params.solAmount,
    params.atMs,
    JSON.stringify(params.payload),
  );
}

export function storeWalletProfile(profile: WalletProfile): void {
  db.prepare(`
    INSERT INTO wallet_profiles
      (address, updated_at_ms, first_seen_at_ms, previous_tx_at_ms, tx_count_before_event,
       funding_source, funding_age_hours, pnl_usd, win_rate, profile_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      updated_at_ms = excluded.updated_at_ms,
      first_seen_at_ms = excluded.first_seen_at_ms,
      previous_tx_at_ms = excluded.previous_tx_at_ms,
      tx_count_before_event = excluded.tx_count_before_event,
      funding_source = excluded.funding_source,
      funding_age_hours = excluded.funding_age_hours,
      pnl_usd = excluded.pnl_usd,
      win_rate = excluded.win_rate,
      profile_json = excluded.profile_json
  `).run(
    profile.address,
    now(),
    profile.firstSeenAtMs,
    profile.previousTxAtMs,
    profile.txCountBeforeEvent,
    profile.fundingSource,
    profile.fundingAgeHours,
    profile.pnlUsd,
    profile.winRate,
    JSON.stringify(profile),
  );
}

export function cachedWalletProfile(address: string, ttlMs: number): WalletProfile | null {
  const row = db.prepare('SELECT updated_at_ms, profile_json FROM wallet_profiles WHERE address = ?').get(address) as
    | { updated_at_ms: number; profile_json: string }
    | undefined;
  if (!row || now() - row.updated_at_ms > ttlMs) return null;
  return JSON.parse(row.profile_json) as WalletProfile;
}

export function tokenCounters(mint: string, windowMs: number): TokenCounters {
  const since = now() - windowMs;
  const totalMentions = (db.prepare('SELECT COUNT(*) AS count FROM token_events WHERE mint = ?').get(mint) as { count: number }).count;
  const freshBuys = (db.prepare("SELECT COUNT(*) AS count FROM token_events WHERE mint = ? AND kind IN ('fresh_wallet_buy', 'old_fresh_wallet_buy')").get(mint) as { count: number }).count;
  const dormantBuys = (db.prepare("SELECT COUNT(*) AS count FROM token_events WHERE mint = ? AND kind IN ('dormant_wallet_buy', 'big_dormant_wallet_buy')").get(mint) as { count: number }).count;
  const semiDormantBuys = (db.prepare("SELECT COUNT(*) AS count FROM token_events WHERE mint = ? AND kind = 'semi_dormant_wallet_buy'").get(mint) as { count: number }).count;
  const bigPnlBuys = (db.prepare("SELECT COUNT(*) AS count FROM token_events WHERE mint = ? AND kind = 'big_pnl_wallet_buy'").get(mint) as { count: number }).count;
  const dormantUniqueWallets2h = (db.prepare(`
    SELECT COUNT(DISTINCT wallet) AS count
    FROM token_events
    WHERE mint = ?
      AND wallet IS NOT NULL
      AND at_ms >= ?
      AND kind IN ('dormant_wallet_buy', 'big_dormant_wallet_buy', 'semi_dormant_wallet_buy')
  `).get(mint, since) as { count: number }).count;

  return {
    mint,
    firstMention: totalMentions === 0,
    totalMentions,
    freshBuys,
    dormantBuys,
    semiDormantBuys,
    bigPnlBuys,
    dormantUniqueWallets2h,
  };
}

export function dormantInflowAlreadySent(mint: string, windowMs: number): boolean {
  const row = db.prepare(`
    SELECT id FROM alert_events
    WHERE mint = ? AND kind = 'dormant_inflow' AND sent_at_ms >= ?
    LIMIT 1
  `).get(mint, now() - windowMs) as { id: number } | undefined;
  return Boolean(row);
}
