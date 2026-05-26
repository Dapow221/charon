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
      bot.sendMessage(message.chat.id, `${config.appName} is watching Pump.fun logs for alert-only signals.`);
    }
    if (text.startsWith('/fee')) {
      const minFee = alertSettingNumber('claimable_fees_min_sol', config.claimableFeesMinSol);
      bot.sendMessage(message.chat.id, `Minimum fee claim alert: ${minFee} SOL\nUse /setfee <sol>, example: /setfee 5`);
    }
    if (text.startsWith('/setfee')) {
      const value = Number(text.split(/\s+/)[1]);
      if (!Number.isFinite(value) || value < 0) {
        bot.sendMessage(message.chat.id, 'Usage: /setfee <sol>\nExample: /setfee 5');
        return;
      }
      setAlertSettingNumber('claimable_fees_min_sol', value);
      bot.sendMessage(message.chat.id, `Minimum fee claim alert updated to ${value} SOL.`);
    }
  });
}
