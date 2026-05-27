import { config } from './config.js';
import type { Alert, FeeClaimEvent, PumpBuyEvent } from './types.js';
import { accountLink, ageLabel, axiomLink, escapeHtml, fmtSol, fmtUsd, pumpLink, short, txLink } from './utils.js';

const titles: Record<Alert['kind'], string> = {
  pump_fee_claim: 'CLAIMABLE FEES',
  fresh_wallet_buy: 'FRESHIE BUY',
  old_fresh_wallet_buy: 'OLD FRESHIE BUY',
  dormant_wallet_buy: 'DEAD TOKEN WAKE',
  big_dormant_wallet_buy: 'BIG DEAD TOKEN WAKE',
  semi_dormant_wallet_buy: 'SEMI-DORMANT DEAD TOKEN',
  dormant_inflow: 'DEAD TOKEN INFLOW',
  dormant_wallet_deploy: 'DORMANT DEPLOY',
  big_pnl_wallet_buy: 'BIG PNL DEAD TOKEN',
  big_pnl_wallet_deploy: 'BIG PNL DEPLOY',
};

export function formatAlert(alert: Alert): string {
  const tokenName = alert.token.symbol || alert.token.name || short(alert.mint);

  if (alert.event.kind === 'fee_claim') {
    return formatFeeClaim(alert, alert.event);
  }

  const profile = alert.walletProfile;
  const buy = alert.event.kind === 'buy' ? alert.event as PumpBuyEvent : null;
  const tokenAge = alert.token.createdAtMs ? ageLabel(alert.token.createdAtMs, alert.event.blockTimeMs) : '?';
  const whale = buy && buy.solAmount >= config.whaleBuySol ? ' 🐋' : '';
  const dolphin = buy && buy.solAmount >= config.dolphinBuySol ? ' 🐬' : '';

  return [
    `${dormantIcon(alert.kind)} <b>${titles[alert.kind]}</b>${whale || dolphin}`,
    '',
    `Name: <b>${escapeHtml(tokenName)}</b>`,
    buy ? `Buy: <b>${fmtSol(buy.solAmount)}</b>` : null,
    `Token: <a href="${pumpLink(alert.mint)}">${short(alert.mint)}</a>`,
    `<code>${escapeHtml(alert.mint)}</code>`,
    `Mcap: ${fmtUsd(alert.token.marketCapUsd)} · Vol 5m: ${fmtUsd(alert.token.volume5mUsd)} · Age: ${tokenAge}`,
    twitterLine(alert),
    profile ? [
      `Wallet: <a href="${accountLink(profile.address)}">${short(profile.address)}</a>`,
      `inactive ${ageLabel(profile.previousTxAtMs, profile.currentTxAtMs)}`,
      `txs ${profile.txCountBeforeEvent ?? '?'}`,
      profile.pnlUsd != null ? `PnL ${fmtUsd(profile.pnlUsd)}` : null,
    ].filter(Boolean).join(' · ') : null,
    `Reason: ${escapeHtml(alert.reason)}`,
    `<a href="${txLink(alert.signature)}">View TX ↗</a>`,
  ].filter(Boolean).join('\n');
}

export function alertButtons(alert: Alert): TelegramInlineKeyboard {
  return {
    inline_keyboard: [[
      { text: 'Axiom', url: axiomLink(alert.mint) },
      { text: 'Pump.fun', url: pumpLink(alert.mint) },
    ]],
  };
}

function formatFeeClaim(alert: Alert, event: FeeClaimEvent): string {
  const title = isCreatorClaim(event) ? '💰 <b>Creator Fee Claim</b>' : '🏦 <b>Github Fee Claim</b>';
  const name = alert.token.name || alert.token.symbol
    ? `${alert.token.name || alert.token.symbol}${alert.token.symbol && alert.token.name ? ` (${alert.token.symbol})` : ''}`
    : short(alert.mint);

  const lines: Array<string | null> = [
    title,
    '',
    `Name: <b>${escapeHtml(name)}</b>`,
    `Token: <a href="${pumpLink(alert.mint)}">${short(alert.mint)}</a>`,
    `<code>${escapeHtml(alert.mint)}</code>`,
    `📊 Mcap: ${fmtUsd(alert.token.marketCapUsd)}`,
    `📈 Vol 5m: ${fmtUsd(alert.token.volume5mUsd)}`,
    twitterLine(alert),
    '',
    `💎 Distributed: <b>${fmtSol(event.distributedSol)}</b>`,
    event.recipients.length ? ['👥 Recipients:', ...event.recipients.map((recipient, index) => {
      const branch = index === event.recipients.length - 1 ? '└' : '├';
      return `  ${branch} <a href="${accountLink(recipient.address)}">${short(recipient.address)}</a> ${recipient.percent.toFixed(1)}%`;
    })].join('\n') : null,
    `<a href="${txLink(alert.signature)}">View TX ↗</a>`,
  ];
  return lines.filter((line) => line != null).join('\n');
}

function isCreatorClaim(event: FeeClaimEvent): boolean {
  return event.recipients.length === 1 && Math.abs((event.recipients[0]?.percent ?? 0) - 100) < 0.01;
}

function dormantIcon(kind: Alert['kind']): string {
  if (kind === 'big_dormant_wallet_buy') return '🧟‍♂️🐋';
  if (kind === 'dormant_wallet_buy') return '🧟';
  if (kind === 'semi_dormant_wallet_buy') return '😴';
  if (kind === 'dormant_inflow') return '🌊🧟';
  if (kind === 'dormant_wallet_deploy') return '🚀🛌';
  if (kind === 'big_pnl_wallet_buy' || kind === 'big_pnl_wallet_deploy') return '🏆';
  return '🔔';
}

function twitterLine(alert: Alert): string | null {
  if (!alert.token.twitterHandle) return null;
  return `🐦 @${escapeHtml(alert.token.twitterHandle)}`;
}

type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
};
