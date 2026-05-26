import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function num(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return !['false', '0', 'no', 'off'].includes(raw.toLowerCase());
}

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const DISC_DIST_FEES = Buffer.from('a537817004b3ca28', 'hex');
export const DISC_PUMP_TRADE = Buffer.from([189, 219, 127, 211, 78, 230, 97, 238]);
export const DISC_PUMP_CREATE = Buffer.from([27, 114, 169, 77, 222, 235, 99, 118]);
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const SOL_MINT = 'So11111111111111111111111111111111111111111';

export const config = {
  appName: process.env.APP_NAME || 'Charon Alerts',
  dbPath: process.env.DB_PATH || './charon-alerts.sqlite',
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  telegramChatId: required('TELEGRAM_CHAT_ID'),
  telegramTopicId: process.env.TELEGRAM_TOPIC_ID || '',
  heliusApiKey: process.env.HELIUS_API_KEY || '',
  solanaRpcUrl: process.env.SOLANA_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ''}`,
  solanaWsUrl: process.env.SOLANA_WS_URL || `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ''}`,
  watchPumpAmm: bool('WATCH_PUMP_AMM', false),
  jupiterEnabled: bool('JUPITER_ENABLED', true),
  jupiterCacheTtlMs: num('JUPITER_CACHE_TTL_MS', 30_000),
  walletProfileCacheTtlMs: num('WALLET_PROFILE_CACHE_TTL_MS', 10 * 60_000),
  walletHistoryLimit: num('WALLET_HISTORY_LIMIT', 50),
  claimableFeesMinSol: num('CLAIMABLE_FEES_MIN_SOL', num('MIN_FEE_CLAIM_SOL', 2)),
  freshMaxTxCount: num('FRESH_MAX_TX_COUNT', 5),
  freshMaxWalletAgeMinutes: num('FRESH_MAX_WALLET_AGE_MINUTES', 24 * 60),
  oldFreshMinFundingAgeHours: num('OLD_FRESH_MIN_FUNDING_AGE_HOURS', 24),
  deadTokenMinAgeDays: num('DEAD_TOKEN_MIN_AGE_DAYS', 3),
  deadTokenBuyMinSol: num('DEAD_TOKEN_BUY_MIN_SOL', 5),
  deadTokenSpikeWindowMinutes: num('DEAD_TOKEN_SPIKE_WINDOW_MINUTES', 10),
  deadTokenSpikeMinSol: num('DEAD_TOKEN_SPIKE_MIN_SOL', 5),
  deadTokenSpikeMinBuyers: num('DEAD_TOKEN_SPIKE_MIN_BUYERS', 2),
  dormantBuyMinSol: num('DORMANT_BUY_MIN_SOL', 3),
  bigDormantBuyMinSol: num('BIG_DORMANT_BUY_MIN_SOL', 7),
  semiDormantBuyMinSol: num('SEMI_DORMANT_BUY_MIN_SOL', 1),
  dormantDays: num('DORMANT_DAYS', 4),
  veryDormantDays: num('VERY_DORMANT_DAYS', 8),
  semiDormantDays: num('SEMI_DORMANT_DAYS', 2),
  semiDormantLowMcapMaxUsd: num('SEMI_DORMANT_LOW_MCAP_MAX_USD', 1_000_000),
  whaleBuySol: num('WHALE_BUY_SOL', 15),
  dolphinBuySol: num('DOLPHIN_BUY_SOL', 5),
  dormantInflowWalletCount: num('DORMANT_INFLOW_WALLET_COUNT', 5),
  dormantInflowWindowMinutes: num('DORMANT_INFLOW_WINDOW_MINUTES', 120),
  dormantDeployDays: num('DORMANT_DEPLOY_DAYS', 4),
  bigPnlMinUsd: num('BIG_PNL_MIN_USD', 50_000),
  sendStartupMessage: bool('SEND_STARTUP_MESSAGE', false),
};

if (!config.heliusApiKey && (!process.env.SOLANA_RPC_URL || !process.env.SOLANA_WS_URL)) {
  throw new Error('HELIUS_API_KEY is required unless SOLANA_RPC_URL and SOLANA_WS_URL are set.');
}
