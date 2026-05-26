import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';

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
  });
}
