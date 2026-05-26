import { config } from './config.js';
import { dormantInflowAlreadySent, storeTokenEvent, tokenCounters } from './db.js';
import type { Alert, AlertKind, PumpEvent, TokenInfo, WalletProfile } from './types.js';

export function evaluateAlerts(event: PumpEvent, token: TokenInfo, walletProfile: WalletProfile | null): Alert[] {
  const alerts: Alert[] = [];
  const base = () => tokenCounters(event.mint, config.dormantInflowWindowMinutes * 60_000);

  if (event.kind === 'fee_claim') {
    if (event.distributedSol >= config.claimableFeesMinSol) {
      alerts.push(makeAlert('pump_fee_claim', event, token, null, base(), `claimable fees >= ${config.claimableFeesMinSol} SOL`));
    }
    return alerts;
  }

  if (!walletProfile) return alerts;

  if (event.kind === 'deploy') {
    if ((walletProfile.dormantDays ?? 0) >= config.dormantDeployDays) {
      alerts.push(makeAlert('dormant_wallet_deploy', event, token, walletProfile, base(), `deployer dormant >= ${config.dormantDeployDays} days`));
    }
    if (walletProfile.tags.includes('big_pnl')) {
      alerts.push(makeAlert('big_pnl_wallet_deploy', event, token, walletProfile, base(), `wallet pnl >= ${config.bigPnlMinUsd} USD`));
    }
    return alerts;
  }

  if (event.kind !== 'buy') return alerts;

  if (event.solAmount >= config.freshBuyMinSol && walletProfile.tags.includes('fresh')) {
    alerts.push(makeAlert('fresh_wallet_buy', event, token, walletProfile, base(), `fresh wallet buy >= ${config.freshBuyMinSol} SOL`));
  }

  if (event.solAmount >= config.freshBuyMinSol && walletProfile.tags.includes('old_fresh')) {
    alerts.push(makeAlert('old_fresh_wallet_buy', event, token, walletProfile, base(), `low-tx wallet funded >= ${config.oldFreshMinFundingAgeHours}h ago`));
  }

  if (
    event.solAmount >= config.semiDormantBuyMinSol &&
    walletProfile.tags.includes('semi_dormant') &&
    !walletProfile.tags.includes('dormant') &&
    (token.marketCapUsd == null || token.marketCapUsd <= config.semiDormantLowMcapMaxUsd)
  ) {
    alerts.push(makeAlert('semi_dormant_wallet_buy', event, token, walletProfile, base(), `semi-dormant low-MC buy >= ${config.semiDormantBuyMinSol} SOL`));
  }

  if (event.solAmount >= config.dormantBuyMinSol && walletProfile.tags.includes('dormant')) {
    const kind: AlertKind = event.solAmount >= config.bigDormantBuyMinSol ? 'big_dormant_wallet_buy' : 'dormant_wallet_buy';
    alerts.push(makeAlert(kind, event, token, walletProfile, base(), `dormant wallet buy >= ${kind === 'big_dormant_wallet_buy' ? config.bigDormantBuyMinSol : config.dormantBuyMinSol} SOL`));
  }

  if (event.solAmount >= config.freshBuyMinSol && walletProfile.tags.includes('big_pnl')) {
    alerts.push(makeAlert('big_pnl_wallet_buy', event, token, walletProfile, base(), `wallet pnl >= ${config.bigPnlMinUsd} USD`));
  }

  for (const alert of alerts) {
    storeTokenEvent({
      mint: alert.mint,
      kind: alert.kind,
      signature: alert.signature,
      wallet: alert.wallet,
      solAmount: event.solAmount,
      atMs: event.blockTimeMs,
      payload: alert,
    });
  }

  const counters = base();
  if (
    counters.dormantUniqueWallets2h >= config.dormantInflowWalletCount &&
    !dormantInflowAlreadySent(event.mint, config.dormantInflowWindowMinutes * 60_000)
  ) {
    alerts.push(makeAlert('dormant_inflow', event, token, walletProfile, counters, `${counters.dormantUniqueWallets2h} dormant wallets bought within ${config.dormantInflowWindowMinutes}m`));
  }

  return alerts;
}

function makeAlert(
  kind: AlertKind,
  event: PumpEvent,
  token: TokenInfo,
  walletProfile: WalletProfile | null,
  counters: ReturnType<typeof tokenCounters>,
  reason: string,
): Alert {
  return {
    kind,
    signature: event.signature,
    wallet: 'wallet' in event ? event.wallet : null,
    mint: event.mint,
    event,
    token,
    walletProfile,
    counters,
    reason,
  };
}
