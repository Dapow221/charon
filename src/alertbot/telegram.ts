import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import {
  addTelegramSubscriber,
  alertSettingNumber,
  listTelegramSubscribers,
  removeTelegramSubscriber,
  setAlertSettingNumber,
} from './db.js';
import { buildRecap, parseRecapPeriod } from './recap.js';

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
      const maxMcap = alertSettingNumber('max_market_cap_usd', config.maxMarketCapUsd);
      const mcapLine = maxMcap > 0 ? `$${maxMcap.toLocaleString('en-US')}` : 'off';
      bot.sendMessage(
        message.chat.id,
        `${config.appName} is watching Pump.fun logs for alert-only signals.\nMin fee claim: ${minFee} SOL\nMax market cap: ${mcapLine}`,
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
    if (text.startsWith('/setmaxcap')) {
      const value = Number(text.split(/\s+/)[1]);
      if (!Number.isFinite(value) || value < 0) {
        bot.sendMessage(message.chat.id, 'Usage: /setmaxcap <usd>\nExample: /setmaxcap 10000\nUse /setmaxcap 0 to disable.');
        return;
      }
      setAlertSettingNumber('max_market_cap_usd', value);
      const reply = value > 0
        ? `Maximum market cap set to $${value.toLocaleString('en-US')}. Coins above this will not alert.`
        : 'Maximum market cap filter disabled. All alerts will be sent (when other rules match).';
      bot.sendMessage(message.chat.id, reply);
      return;
    }
    if (text.startsWith('/maxcap')) {
      const maxMcap = alertSettingNumber('max_market_cap_usd', config.maxMarketCapUsd);
      const line = maxMcap > 0
        ? `Maximum market cap: $${maxMcap.toLocaleString('en-US')}`
        : 'Maximum market cap: off (no filter)';
      bot.sendMessage(message.chat.id, `${line}\nUse /setmaxcap <usd>, example: /setmaxcap 10000\nUse /setmaxcap 0 to disable.`);
      return;
    }
    if (text.startsWith('/recap')) {
      void handleRecapCommand(message.chat.id, text).catch((err: Error) => {
        console.log(`[recap] ${err.message}`);
        bot.sendMessage(message.chat.id, 'Recap failed. Try again in a moment.');
      });
    }
  });
}

async function handleRecapCommand(chatId: number, text: string): Promise<void> {
  const period = parseRecapPeriod(text);
  await bot.sendMessage(chatId, `Building recap (${period.label})… fetching prices.`);
  const body = await buildRecap(period);
  await bot.sendMessage(chatId, body, { disable_web_page_preview: true });
}
