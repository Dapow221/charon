export type AlertKind =
  | 'pump_fee_claim'
  | 'fresh_wallet_buy'
  | 'old_fresh_wallet_buy'
  | 'dormant_wallet_buy'
  | 'big_dormant_wallet_buy'
  | 'semi_dormant_wallet_buy'
  | 'dormant_inflow'
  | 'dormant_wallet_deploy'
  | 'big_pnl_wallet_buy'
  | 'big_pnl_wallet_deploy';

export type PumpEventKind = 'fee_claim' | 'buy' | 'deploy';

export type TokenInfo = {
  mint: string;
  symbol: string;
  name: string;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  createdAtMs: number | null;
  launchpad: string | null;
};

export type FeeClaimEvent = {
  kind: 'fee_claim';
  signature: string;
  mint: string;
  distributedSol: number;
  recipients: Array<{ address: string; bps: number; percent: number }>;
  blockTimeMs: number;
};

export type PumpBuyEvent = {
  kind: 'buy';
  signature: string;
  wallet: string;
  mint: string;
  solAmount: number;
  tokenAmount: number | null;
  blockTimeMs: number;
};

export type PumpDeployEvent = {
  kind: 'deploy';
  signature: string;
  wallet: string;
  mint: string;
  blockTimeMs: number;
};

export type PumpEvent = FeeClaimEvent | PumpBuyEvent | PumpDeployEvent;

export type WalletProfile = {
  address: string;
  currentTxAtMs: number;
  previousTxAtMs: number | null;
  dormantDays: number | null;
  firstSeenAtMs: number | null;
  walletAgeMinutes: number | null;
  txCountBeforeEvent: number | null;
  fundingSource: string | null;
  fundingAgeHours: number | null;
  pnlUsd: number | null;
  winRate: number | null;
  tags: Array<'fresh' | 'old_fresh' | 'dormant' | 'very_dormant' | 'semi_dormant' | 'big_pnl'>;
};

export type Alert = {
  kind: AlertKind;
  signature: string;
  wallet: string | null;
  mint: string;
  event: PumpEvent;
  token: TokenInfo;
  walletProfile: WalletProfile | null;
  counters: TokenCounters;
  reason: string;
};

export type TokenCounters = {
  mint: string;
  firstMention: boolean;
  totalMentions: number;
  freshBuys: number;
  dormantBuys: number;
  semiDormantBuys: number;
  bigPnlBuys: number;
  dormantUniqueWallets2h: number;
};
