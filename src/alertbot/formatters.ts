import { config } from './config.js';
import type { Alert, PumpBuyEvent } from './types.js';
import { accountLink, ageLabel, escapeHtml, fmtSol, fmtUsd, gmgnLink, pumpLink, short, txLink } from './utils.js';

const titles: Record<Alert['kind'], string> = {
  pump_fee_claim: 'CLAIMABLE FEES',
  fresh_wallet_buy: 'FRESHIE BUY',
  old_fresh_wallet_buy: 'OLD FRESHIE BUY',
  dormant_wallet_buy: 'DORMANT BUY',
  big_dormant_wallet_buy: 'BIG DORMANT BUY',
  semi_dormant_wallet_buy: 'SEMI-DORMANT BUY',
  dormant_inflow: 'DORMANTS INFLOW',
  dormant_wallet_deploy: 'DORMANT DEPLOY',
  big_pnl_wallet_buy: 'BIG PNL BUY',
  big_pnl_wallet_deploy: 'BIG PNL DEPLOY',
};

export function formatAlert(alert: Alert): string {
  const tokenName = alert.token.symbol || alert.token.name || short(alert.mint);
  const first = alert.counters.firstMention ? ' *first mention*' : '';
  const whale = alert.event.kind === 'buy' && alert.event.solAmount >= config.whaleBuySol ? ' whale' : '';
  const dolphin = alert.event.kind === 'buy' && alert.event.solAmount >= config.dolphinBuySol ? ' dolphin' : '';
  const pump = alert.token.launchpad === 'pump' || alert.token.launchpad === 'pumpfun' ? ' pump.fun' : '';
  const header = `<b>[${titles[alert.kind]}]</b>${first}${whale || dolphin}${pump}`;

  if (alert.event.kind === 'fee_claim') {
    return [
      header,
      `<b>${escapeHtml(tokenName)}</b> | ${fmtSol(alert.event.distributedSol)} distributed`,
      `Mint: <code>${escapeHtml(alert.mint)}</code>`,
      `Recipients: ${alert.event.recipients.length}`,
      links(alert.mint, alert.signature, null),
    ].join('\n');
  }

  const profile = alert.walletProfile;
  const buy = alert.event.kind === 'buy' ? alert.event as PumpBuyEvent : null;
  return [
    header,
    `<b>${escapeHtml(tokenName)}</b>${buy ? ` | ${fmtSol(buy.solAmount)}` : ''} | MC ${fmtUsd(alert.token.marketCapUsd)}`,
    `Mint: <code>${escapeHtml(alert.mint)}</code>`,
    profile ? [
      `Wallet: <a href="${accountLink(profile.address)}">${short(profile.address)}</a>`,
      `inactive ${ageLabel(profile.previousTxAtMs, profile.currentTxAtMs)}`,
      `age ${ageLabel(profile.firstSeenAtMs, profile.currentTxAtMs)}`,
      `txs ${profile.txCountBeforeEvent ?? '?'}`,
      profile.pnlUsd != null ? `PnL ${fmtUsd(profile.pnlUsd)}` : null,
    ].filter(Boolean).join(' | ') : null,
    `Tracker: fresh ${alert.counters.freshBuys} | dormant ${alert.counters.dormantBuys} | semi ${alert.counters.semiDormantBuys} | bigPnL ${alert.counters.bigPnlBuys}`,
    `Reason: ${escapeHtml(alert.reason)}`,
    links(alert.mint, alert.signature, profile?.address || null),
  ].filter(Boolean).join('\n');
}

function links(mint: string, signature: string, wallet: string | null): string {
  return [
    `<a href="${gmgnLink(mint)}">GMGN</a>`,
    `<a href="${pumpLink(mint)}">PumpFun</a>`,
    `<a href="${txLink(signature)}">Tx</a>`,
    wallet ? `<a href="${accountLink(wallet)}">Wallet</a>` : null,
  ].filter(Boolean).join(' | ');
}
