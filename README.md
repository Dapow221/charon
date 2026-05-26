# Charon Alerts

Charon Alerts is a TypeScript Telegram alert bot for Pump.fun/Solana wallet-intelligence signals. It does not execute trades, sign swaps, manage positions, or require a private key.

This codebase is experimental. Treat alerts as research signals, not trading instructions.

## Flow

1. Charon subscribes to Pump.fun program logs over Solana WebSocket.
2. It parses Pump.fun fee-claim logs and infers Pump buys/deploys from parsed Solana transactions.
3. It profiles the buyer/deployer wallet using Solana transaction history.
4. It enriches token metadata with Jupiter when available.
5. It evaluates BBB-style alert rules for claimable fees, fresh wallets, dormant wallets, dormant inflow, deploys, and big-PnL wallets.
6. Matching alerts are deduped, stored in SQLite, and sent to Telegram.

## Install

```bash
git clone git@github.com:yunus-0x/charon.git
cd charon
npm install
cp .env.example .env
```

Edit `.env` with your credentials, then run:

```bash
npm start
```

For PM2:

```bash
pm2 start "npm start" --name charon-alerts
pm2 save
```

## Required Config

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
HELIUS_API_KEY=
```

`TELEGRAM_CHAT_ID` is the chat or group ID where Charon sends alerts and accepts commands. `HELIUS_API_KEY` is used for RPC, WebSocket logs, and wallet history. You can provide custom endpoints instead:

```env
SOLANA_RPC_URL=
SOLANA_WS_URL=
```

## Alert Config

```env
CLAIMABLE_FEES_MIN_SOL=2
FRESH_BUY_MIN_SOL=0.47
FRESH_MAX_TX_COUNT=5
FRESH_MAX_WALLET_AGE_MINUTES=1440
OLD_FRESH_MIN_FUNDING_AGE_HOURS=24
DORMANT_BUY_MIN_SOL=3
BIG_DORMANT_BUY_MIN_SOL=7
SEMI_DORMANT_BUY_MIN_SOL=1
DORMANT_DAYS=4
VERY_DORMANT_DAYS=8
SEMI_DORMANT_DAYS=2
SEMI_DORMANT_LOW_MCAP_MAX_USD=1000000
DORMANT_INFLOW_WALLET_COUNT=5
DORMANT_INFLOW_WINDOW_MINUTES=120
DORMANT_DEPLOY_DAYS=4
BIG_PNL_MIN_USD=50000
```

## Alerts

- `pump_fee_claim`: Pump.fun fee distribution above `CLAIMABLE_FEES_MIN_SOL`.
- `fresh_wallet_buy`: Pump buy above `FRESH_BUY_MIN_SOL` from a low-transaction, young wallet.
- `old_fresh_wallet_buy`: Pump buy from a low-transaction wallet funded at least `OLD_FRESH_MIN_FUNDING_AGE_HOURS` ago.
- `semi_dormant_wallet_buy`: low market-cap Pump buy above `SEMI_DORMANT_BUY_MIN_SOL` after moderate inactivity.
- `dormant_wallet_buy`: Pump buy above `DORMANT_BUY_MIN_SOL` after significant inactivity.
- `big_dormant_wallet_buy`: dormant buy above `BIG_DORMANT_BUY_MIN_SOL`.
- `dormant_inflow`: at least `DORMANT_INFLOW_WALLET_COUNT` dormant wallets buying one token within `DORMANT_INFLOW_WINDOW_MINUTES`.
- `dormant_wallet_deploy`: Pump token deployer dormant for at least `DORMANT_DEPLOY_DAYS`.
- `big_pnl_wallet_buy` / `big_pnl_wallet_deploy`: wallet PnL above `BIG_PNL_MIN_USD` when Jupiter PnL data is available.

## Commands

`/status` confirms the alert bot is running.

## Storage

Charon uses `charon-alerts.sqlite` by default. It stores alert events, token events, wallet profiles, and token metadata cache.

## Verification

```bash
npm run check
```
