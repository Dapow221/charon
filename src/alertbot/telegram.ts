import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import {
  addTelegramSubscriber,
  alertSettingNumber,
  listTelegramSubscribers,
  removeTelegramSubscriber,
  setAlertSettingNumber,
} from './db.js';

export const bot = new TelegramBot(config.telegramBotToken, { polling: true });

function sendOptions(chatId: string): TelegramBot.SendMessageOptions {
  return {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(config.telegramChatId &&
    String(chatId) === String(config.telegramChatId) &&
    config.telegramTopicId
      ? { message_thread_id: Number(config.telegramTopicId) }
      : {}),
  };
}

export function ensureDefaultSubscriber(): void {
  if (config.telegramChatId) addTelegramSubscriber(config.telegramChatId);
}

export async function sendTelegram(text: string): Promise<TelegramBot.Message | null> {
  const chatIds = listTelegramSubscribers();
  if (chatIds.length === 0) {
    ensureDefaultSubscriber();
    chatIds.push(...listTelegramSubscribers());
  }
  if (chatIds.length === 0) return null;

  let first: TelegramBot.Message | null = null;
  for (const chatId of chatIds) {
    try {
      const sent = await bot.sendMessage(chatId, text, sendOptions(chatId));
      if (!first) first = sent;
    } catch (err: unknown) {
      const statusCode = (err as { response?: { statusCode?: number } }).response?.statusCode;
      if (statusCode === 403 || statusCode === 400) removeTelegramSubscriber(chatId);
    }
  }
  return first;
}

export function setupTelegramCommands(): void {
  ensureDefaultSubscriber();

  bot.on('message', (message) => {
    addTelegramSubscriber(message.chat.id);
    const text = message.text || '';
    if (text.startsWith('/status')) {
      const minFee = alertSettingNumber('claimable_fees_min_sol', config.claimableFeesMinSol);
      const minMcap = alertSettingNumber('min_market_cap_usd', config.minMarketCapUsd);
      const mcapLine = minMcap > 0 ? `${minMcap} USD` : 'off';
      bot.sendMessage(
        message.chat.id,
        `${config.appName} is watching Pump.fun logs for alert-only signals.\nMin fee claim: ${minFee} SOL\nMin market cap: ${mcapLine}`,
      );
    }
    if (text.startsWith('/setfee')) {
      const value = Number(text.split(/\s+/)[1]);
      if (!Number.isFinite(value) || value < 0) {
        bot.sendMessage(message.chat.id, 'Usage: /setfee <sol>\nExample: /setfee 5');
        return;
      }
      setAlertSettingNumber('claimable_fees_min_sol', value);
      bot.sendMessage(message.chat.id, `Minimum fee claim alert updated to ${value} SOL.`);
      return;
    }
    if (text.startsWith('/fee')) {
      const minFee = alertSettingNumber('claimable_fees_min_sol', config.claimableFeesMinSol);
      bot.sendMessage(message.chat.id, `Minimum fee claim alert: ${minFee} SOL\nUse /setfee <sol>, example: /setfee 5`);
      return;
    }
    if (text.startsWith('/setmcap')) {
      const value = Number(text.split(/\s+/)[1]);
      if (!Number.isFinite(value) || value < 0) {
        bot.sendMessage(message.chat.id, 'Usage: /setmcap <usd>\nExample: /setmcap 50000\nUse /setmcap 0 to disable.');
        return;
      }
      setAlertSettingNumber('min_market_cap_usd', value);
      const reply = value > 0
        ? `Minimum market cap filter set to $${value.toLocaleString('en-US')}. Alerts below this are skipped.`
        : 'Minimum market cap filter disabled. All alerts will be sent (when other rules match).';
      bot.sendMessage(message.chat.id, reply);
      return;
    }
    if (text.startsWith('/mcap')) {
      const minMcap = alertSettingNumber('min_market_cap_usd', config.minMarketCapUsd);
      const line = minMcap > 0
        ? `Minimum market cap: $${minMcap.toLocaleString('en-US')}`
        : 'Minimum market cap: off (no filter)';
      bot.sendMessage(message.chat.id, `${line}\nUse /setmcap <usd>, example: /setmcap 50000\nUse /setmcap 0 to disable.`);
    }
  });
}
