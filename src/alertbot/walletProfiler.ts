import { PublicKey, type Connection } from '@solana/web3.js';
import { config } from './config.js';
import { cachedWalletProfile, storeWalletProfile } from './db.js';
import { fetchWalletPnlUsd } from './enrichment.js';
import type { WalletProfile } from './types.js';

export async function profileWallet(
  connection: Connection,
  address: string,
  currentSignature: string,
  currentTxAtMs: number,
): Promise<WalletProfile> {
  const cached = cachedWalletProfile(address, config.walletProfileCacheTtlMs);
  if (cached && cached.currentTxAtMs === currentTxAtMs) return cached;

  const signatures = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 1000 }, 'confirmed');
  const currentIndex = signatures.findIndex(row => row.signature === currentSignature);
  const previous = signatures[currentIndex >= 0 ? currentIndex + 1 : 1] || null;
  const oldest = signatures[signatures.length - 1] || null;
  const previousTxAtMs = previous?.blockTime ? previous.blockTime * 1000 : null;
  const firstSeenAtMs = oldest?.blockTime ? oldest.blockTime * 1000 : null;
  const dormantDays = previousTxAtMs ? (currentTxAtMs - previousTxAtMs) / 86_400_000 : null;
  const walletAgeMinutes = firstSeenAtMs ? (currentTxAtMs - firstSeenAtMs) / 60_000 : null;
  const txCountBeforeEvent = currentIndex >= 0 ? Math.max(0, signatures.length - currentIndex - 1) : Math.max(0, signatures.length - 1);
  const fundingAgeHours = firstSeenAtMs ? (currentTxAtMs - firstSeenAtMs) / 3_600_000 : null;
  const { pnlUsd, winRate } = await fetchWalletPnlUsd(address);

  const tags: WalletProfile['tags'] = [];
  if (txCountBeforeEvent <= config.freshMaxTxCount && walletAgeMinutes != null && walletAgeMinutes <= config.freshMaxWalletAgeMinutes) tags.push('fresh');
  if (txCountBeforeEvent <= config.freshMaxTxCount && fundingAgeHours != null && fundingAgeHours >= config.oldFreshMinFundingAgeHours) tags.push('old_fresh');
  if (dormantDays != null && dormantDays >= config.semiDormantDays) tags.push('semi_dormant');
  if (dormantDays != null && dormantDays >= config.dormantDays) tags.push('dormant');
  if (dormantDays != null && dormantDays >= config.veryDormantDays) tags.push('very_dormant');
  if (pnlUsd != null && pnlUsd >= config.bigPnlMinUsd) tags.push('big_pnl');

  const profile: WalletProfile = {
    address,
    currentTxAtMs,
    previousTxAtMs,
    dormantDays,
    firstSeenAtMs,
    walletAgeMinutes,
    txCountBeforeEvent,
    fundingSource: null,
    fundingAgeHours,
    pnlUsd,
    winRate,
    tags,
  };
  storeWalletProfile(profile);
  return profile;
}
