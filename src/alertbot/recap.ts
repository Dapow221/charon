import { config } from './config.js';
import { listRecapAlertsSince } from './db.js';
import { fetchTokenInfo } from './enrichment.js';
import type { Alert } from './types.js';

export type RecapPeriod = { sinceMs: number; label: string };

export type RecapCall = {
  mint: string;
  tokenName: string;
  caller: string;
  wallet: string | null;
  multiplier: number | null;
  sentAtMs: number;
};

export type RecapCallerScore = {
  caller: string;
  points: number;
};

export function parseRecapPeriod(text: string): RecapPeriod {
  const arg = text.trim().split(/\s+/)[1]?.toLowerCase() ?? '1d';
  const match = arg.match(/^(\d+(?:\.\d+)?)(h|d)$/);
  if (!match) return { sinceMs: 86_400_000, label: '1d' };
  const amount = Number(match[1]);
  const unit = match[2];
  const ms = unit === 'h' ? amount * 3_600_000 : amount * 86_400_000;
  return { sinceMs: ms, label: arg };
}

export async function buildRecap(period: RecapPeriod): Promise<string> {
  const sinceMs = Date.now() - period.sinceMs;
  const rows = listRecapAlertsSince(sinceMs);
  const seenMints = new Set<string>();
  const calls: RecapCall[] = [];

  const pending: Array<{ alert: Alert; mint: string; wallet: string | null; sentAtMs: number }> = [];
  for (const row of rows) {
    if (seenMints.has(row.mint)) continue;
    seenMints.add(row.mint);

    let alert: Alert;
    try {
      alert = JSON.parse(row.payloadJson) as Alert;
    } catch {
      continue;
    }
    pending.push({
      alert,
      mint: row.mint,
      wallet: row.wallet ?? alert.wallet,
      sentAtMs: row.sentAtMs,
    });
  }

  for (let i = 0; i < pending.length; i += 4) {
    const batch = pending.slice(i, i + 4);
    const multipliers = await Promise.all(batch.map((item) => resolveMultiplier(item.alert)));
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      calls.push({
        mint: item.mint,
        tokenName: displayTokenName(item.alert),
        caller: callerLabel(item.wallet),
        wallet: item.wallet,
        multiplier: multipliers[j],
        sentAtMs: item.sentAtMs,
      });
    }
  }

  calls.sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0));

  const known = calls.filter((c) => c.multiplier != null && c.multiplier > 0);
  const hits = known.filter((c) => c.multiplier! >= config.recapHitMultiplier);
  const hitRate = known.length ? Math.round((hits.length / known.length) * 100) : 0;
  const multipliers = known.map((c) => c.multiplier!);
  const medianPct = medianGainPercent(multipliers);
  const avgMult = multipliers.length ? multipliers.reduce((a, b) => a + b, 0) / multipliers.length : 0;
  const bestMult = multipliers.length ? Math.max(...multipliers) : 0;

  const callerScores = scoreCallers(calls);
  const lines: string[] = [
    '🏆 Leaderboard',
    '',
    '👑 Top Callers',
    ...formatTopCallers(callerScores),
    '',
    '📊 Group Stats',
    ` ├ Period   ${period.label}`,
    ` ├ Calls    ${calls.length}`,
    ` ├ Hit Rate ${hitRate}%`,
    ` ├ Median   ${medianPct}%`,
    ` └ Return   ${formatMult(bestMult)} (Avg: ${formatMult(avgMult)})`,
    '',
  ];

  if (!calls.length) {
    lines.push('No alerts in this period yet.');
    return lines.join('\n');
  }

  const maxList = 25;
  for (let i = 0; i < Math.min(calls.length, maxList); i++) {
    lines.push(formatCallLine(i + 1, calls[i]));
  }
  if (calls.length > maxList) {
    lines.push(`… +${calls.length - maxList} more`);
  }

  return lines.join('\n');
}

function displayTokenName(alert: Alert): string {
  const name = alert.token.symbol || alert.token.name;
  if (name) return name.slice(0, 24);
  return `${alert.mint.slice(0, 6)}…`;
}

function callerLabel(wallet: string | null): string {
  if (!wallet) return 'Anonymous';
  if (wallet.length <= 10) return wallet;
  return wallet.slice(-8);
}

async function resolveMultiplier(alert: Alert): Promise<number | null> {
  const entryMcap = alert.token.marketCapUsd;
  const entryPrice = alert.token.priceUsd;
  const current = await fetchTokenInfo(alert.mint);

  if (entryMcap != null && entryMcap > 0 && current.marketCapUsd != null && current.marketCapUsd > 0) {
    return current.marketCapUsd / entryMcap;
  }
  if (entryPrice != null && entryPrice > 0 && current.priceUsd != null && current.priceUsd > 0) {
    return current.priceUsd / entryPrice;
  }
  return null;
}

function scoreCallers(calls: RecapCall[]): RecapCallerScore[] {
  const totals = new Map<string, number>();
  for (const call of calls) {
    const mult = call.multiplier;
    if (mult == null || mult < config.recapHitMultiplier) continue;
    const points = Math.log2(mult);
    totals.set(call.caller, (totals.get(call.caller) ?? 0) + points);
  }
  return [...totals.entries()]
    .map(([caller, points]) => ({ caller, points: Math.round(points * 10) / 10 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);
}

function formatTopCallers(scores: RecapCallerScore[]): string[] {
  if (!scores.length) return [' └ (no 2x+ calls yet)'];
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  return scores.map((row, index) => {
    const branch = index === scores.length - 1 ? '└' : '├';
    const medal = medals[index] ?? '•';
    return ` ${branch}${medal} ${row.caller} [${row.points} pts]`;
  });
}

function formatCallLine(rank: number, call: RecapCall): string {
  const emoji = callEmoji(call.multiplier);
  const mult = call.multiplier != null && call.multiplier > 0 ? ` [${formatMult(call.multiplier)}]` : '';
  const name = padEnd(call.tokenName, 14);
  return `${emoji}${rank}  ${name} » ${call.caller}${mult}`;
}

function callEmoji(multiplier: number | null): string {
  if (multiplier == null || multiplier < 1) return '😭';
  if (multiplier >= 5) return '💸';
  if (multiplier >= config.recapHitMultiplier) return '😎';
  if (multiplier >= 1) return '🥱';
  return '😭';
}

function medianGainPercent(multipliers: number[]): number {
  if (!multipliers.length) return 0;
  const sorted = [...multipliers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round((median - 1) * 100);
}

function formatMult(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(1)}x`;
}

function padEnd(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}
