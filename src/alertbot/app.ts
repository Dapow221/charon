import { alertSettingNumber, initDb, seenAlert, storeAlert, storeTokenEvent } from './db.js';
import { fetchTokenInfo } from './enrichment.js';
import { formatAlert } from './formatters.js';
import { evaluateAlerts } from './rules.js';
import { makeConnection, startSolanaWatcher } from './solanaWatcher.js';
import { bot, sendTelegram, setupTelegramCommands } from './telegram.js';
import type { Alert, PumpEvent, WalletProfile } from './types.js';
import { profileWallet } from './walletProfiler.js';
import { config } from './config.js';

const connection = makeConnection();

async function handlePumpEvent(event: PumpEvent): Promise<void> {
  const minFeeSol = alertSettingNumber('claimable_fees_min_sol', config.claimableFeesMinSol);
  if (event.kind === 'fee_claim' && event.distributedSol < minFeeSol) return;
  if (event.kind === 'buy' && event.solAmount < minimumRelevantBuySol()) return;

  const token = await fetchTokenInfo(event.mint);
  let profile: WalletProfile | null = null;

  if ('wallet' in event && shouldProfileWallet(event, token.createdAtMs)) {
    profile = await profileWallet(connection, event.wallet, event.signature, event.blockTimeMs);
  }

  storeTokenEvent({
    mint: event.mint,
    kind: event.kind,
    signature: event.signature,
    wallet: 'wallet' in event ? event.wallet : null,
    solAmount: event.kind === 'buy' ? event.solAmount : event.kind === 'fee_claim' ? event.distributedSol : null,
    atMs: event.blockTimeMs,
    payload: event,
  });

  const alerts = evaluateAlerts(event, token, profile);
  for (const alert of alerts) {
    if (seenAlert(alert)) continue;
    if (!passesMarketCapFilter(alert)) continue;
    const sent = await sendTelegram(formatAlert(alert));
    storeAlert(alert, sent?.message_id ?? null);
    console.log(`[alertbot] sent ${alert.kind} ${alert.mint.slice(0, 8)} ${alert.signature.slice(0, 8)}`);
  }
}

async function main(): Promise<void> {
  initDb();
  setupTelegramCommands();
  startSolanaWatcher(connection, handlePumpEvent);
  console.log(`[alertbot] ${config.appName} started in alert-only mode`);
  if (config.sendStartupMessage) await sendTelegram(`${config.appName} started in alert-only mode.`);
}

function passesMarketCapFilter(alert: Alert): boolean {
  const minMcap = alertSettingNumber('min_market_cap_usd', config.minMarketCapUsd);
  if (minMcap <= 0) return true;
  const mcap = alert.token.marketCapUsd;
  return mcap != null && mcap >= minMcap;
}

function minimumRelevantBuySol(): number {
  return Math.min(
    config.semiDormantBuyMinSol,
    config.dormantBuyMinSol,
    config.bigDormantBuyMinSol,
    config.deadTokenBuyMinSol,
    config.deadTokenSpikeMinSol,
  );
}

function shouldProfileWallet(event: PumpEvent, tokenCreatedAtMs: number | null): boolean {
  if (event.kind === 'deploy') return true;
  if (event.kind !== 'buy') return false;
  if (!tokenCreatedAtMs) return false;
  const tokenAgeDays = (event.blockTimeMs - tokenCreatedAtMs) / 86_400_000;
  return tokenAgeDays >= config.deadTokenMinAgeDays;
}

main().catch((err) => {
  console.error(err);
  bot.stopPolling().catch(() => {});
  process.exit(1);
});
