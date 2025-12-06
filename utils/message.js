const logger = require('./logger');
const config = require('../config');
const { Telegraf } = require('telegraf');

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/[_*[\]()~`>#+-={}.!]/g, '\\$&');
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeCallbackData(text) {
  if (!text) return '';
  return text
    .replace(/\./g, '_DOT_')
    .replace(/\//g, '_SLASH_')
    .replace(/@/g, '_AT_')
    .replace(/:/g, '_COLON_')
    .replace(/#/g, '_HASH_')
    .replace(/\?/g, '_QUESTION_')
    .replace(/&/g, '_AND_')
    .replace(/=/g, '_EQUALS_')
    .replace(/%/g, '_PERCENT_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 64);
}

function unsafeCallbackData(text) {
  if (!text) return '';
  return text
    .replace(/_DOT_/g, '.')
    .replace(/_SLASH_/g, '/')
    .replace(/_AT_/g, '@')
    .replace(/_COLON_/g, ':')
    .replace(/_HASH_/g, '#')
    .replace(/_QUESTION_/g, '?')
    .replace(/_AND_/g, '&')
    .replace(/_EQUALS_/g, '=')
    .replace(/_PERCENT_/g, '%');
}

function createSafeCallback(prefix, ...params) {
  const safeParams = params.map(param => safeCallbackData(String(param)));
  return `${prefix}_${safeParams.join('_')}`;
}

function parseSafeCallback(callbackData) {
  const parts = callbackData.split('_');
  const prefix = parts[0];
  const params = parts.slice(1).map(unsafeCallbackData);
  return { prefix, params };
}

async function sendMessage(ctxOrBot, chatIdOrText, textOrOptions, options) {
  let bot, chatId, text, finalOptions;
  
  if (ctxOrBot instanceof Telegraf) {
    bot = ctxOrBot;
    chatId = chatIdOrText;
    text = textOrOptions;
    finalOptions = options || {};
  } else {
    bot = ctxOrBot.bot || ctxOrBot;
    chatId = ctxOrBot.chat?.id || config.ADMIN_USER_ID;
    text = chatIdOrText;
    finalOptions = textOrOptions || {};
  }

  if (!bot || !chatId) {
    logger.error('Не указан бот или chatId');
    return false;
  }

  if (typeof text !== 'string') {
    try {
      text = String(text);
    } catch (e) {
      text = 'Неизвестное сообщение';
    }
  }

  const {
    parse_mode = 'HTML',
    disable_web_page_preview = true,
    retryCount = 2,
    timeout = 30000,
    ...otherOptions
  } = finalOptions;

  try {
    let formattedText = text;
    
    if (parse_mode === 'MarkdownV2') {
      formattedText = escapeMarkdown(text);
    }

    const sendPromise = bot.telegram.sendMessage(chatId, formattedText, {
      parse_mode,
      disable_web_page_preview,
      ...otherOptions
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout sending message')), timeout);
    });

    await Promise.race([sendPromise, timeoutPromise]);
    return true;
  } catch (error) {
    logger.error(`Ошибка отправки сообщения: ${error.message}`);
    
    if (error.message.includes('can\'t parse entities') && parse_mode !== 'HTML') {
      return sendMessage(bot, chatId, text, {
        ...finalOptions,
        parse_mode: 'HTML',
        retryCount: retryCount - 1
      });
    }

    if (retryCount > 0 && !error.message.includes('Timeout')) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return sendMessage(bot, chatId, text, {
        ...finalOptions,
        retryCount: retryCount - 1
      });
    }

    return false;
  }
}

async function sendLongMessage(ctxOrBot, chatIdOrText, textOrOptions, options) {
  const MAX_LENGTH = 4000;
  let text;
  
  text = typeof chatIdOrText === 'string' ? chatIdOrText : textOrOptions;

  if (typeof text !== 'string') {
    text = String(text);
  }

  const chunks = [];
  while (text.length > 0) {
    chunks.push(text.substring(0, MAX_LENGTH));
    text = text.substring(MAX_LENGTH);
  }
  
  for (const chunk of chunks) {
    const success = await sendMessage(ctxOrBot, chatIdOrText, chunk, {
      ...(typeof textOrOptions === 'object' ? textOrOptions : {}),
      ...(options || {})
    });
    
    if (!success) {
      logger.error('Не удалось отправить часть длинного сообщения');
    }
    
    if (chunks.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

module.exports = {
  sendMessage,
  escapeMarkdown,
  sendLongMessage,
  escapeHtml,
  safeCallbackData,
  unsafeCallbackData,
  createSafeCallback,
  parseSafeCallback
};