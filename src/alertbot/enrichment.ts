import axios from 'axios';
import { config } from './config.js';
import { db } from './db.js';
import type { TokenInfo } from './types.js';
import { now } from './utils.js';

const headers = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

const emptyToken = (mint: string): TokenInfo => ({
  mint,
  symbol: '',
  name: '',
  marketCapUsd: null,
  liquidityUsd: null,
  priceUsd: null,
  createdAtMs: null,
  launchpad: null,
});

export async function fetchTokenInfo(mint: string): Promise<TokenInfo> {
  const cached = db.prepare('SELECT updated_at_ms, token_json FROM token_cache WHERE mint = ?').get(mint) as
    | { updated_at_ms: number; token_json: string }
    | undefined;
  if (cached && now() - cached.updated_at_ms < config.jupiterCacheTtlMs) {
    return JSON.parse(cached.token_json) as TokenInfo;
  }

  if (!config.jupiterEnabled) return emptyToken(mint);

  try {
    const url = new URL('https://datapi.jup.ag/v1/assets/search');
    url.searchParams.set('query', mint);
    const res = await axios.get(url.toString(), { timeout: 10_000, headers });
    const rows = Array.isArray(res.data) ? res.data : [];
    const row = rows.find((item: any) => item?.id === mint) || rows[0];
    const token: TokenInfo = row ? {
      mint,
      symbol: String(row.symbol || ''),
      name: String(row.name || ''),
      marketCapUsd: finite(row.mcap ?? row.fdv),
      liquidityUsd: finite(row.liquidity),
      priceUsd: finite(row.usdPrice),
      createdAtMs: row.createdAt ? Number(row.createdAt) : null,
      launchpad: row.launchpad || null,
    } : emptyToken(mint);
    db.prepare(`
      INSERT INTO token_cache (mint, updated_at_ms, token_json)
      VALUES (?, ?, ?)
      ON CONFLICT(mint) DO UPDATE SET updated_at_ms = excluded.updated_at_ms, token_json = excluded.token_json
    `).run(mint, now(), JSON.stringify(token));
    return token;
  } catch (err: any) {
    console.log(`[token] ${mint.slice(0, 8)} ${err.response?.status || ''} ${err.message}`);
    return cached ? JSON.parse(cached.token_json) as TokenInfo : emptyToken(mint);
  }
}

export async function fetchWalletPnlUsd(address: string): Promise<{ pnlUsd: number | null; winRate: number | null }> {
  try {
    const url = new URL('https://datapi.jup.ag/v1/pnl');
    url.searchParams.set('addresses', address);
    url.searchParams.set('includeClosed', 'true');
    const res = await axios.get(url.toString(), { timeout: 10_000, headers });
    const rows = Object.values(res.data?.[address] || {}) as any[];
    let pnl = 0;
    let wins = 0;
    let counted = 0;
    for (const row of rows) {
      const value = finite(row.realizedPnl ?? row.unrealizedPnl ?? row.pnl ?? row.profit);
      if (value == null) continue;
      pnl += value;
      counted++;
      if (value > 0) wins++;
    }
    return {
      pnlUsd: counted ? pnl : null,
      winRate: counted ? wins / counted * 100 : null,
    };
  } catch (err: any) {
    console.log(`[wallet-pnl] ${address.slice(0, 8)} ${err.response?.status || ''} ${err.message}`);
    return { pnlUsd: null, winRate: null };
  }
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
