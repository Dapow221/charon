import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { alertSettingNumber, setAlertSettingNumber } from './db.js';

export const bot = new TelegramBot(config.telegramBotToken, { polling: true });

export async function sendTelegram(text: string): Promise<TelegramBot.Message> {
  return bot.sendMessage(config.telegramChatId, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(config.telegramTopicId ? { message_thread_id: Number(config.telegramTopicId) } : {}),
  });
}

export function setupTelegramCommands(): void {
  bot.on('message', (message) => {
    if (String(message.chat.id) !== String(config.telegramChatId)) return;
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
