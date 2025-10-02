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

// Добавить в utils/message.js или создать новый файл utils/helpers.js
function safeCallbackData(text) {
  if (!text) return '';
  return text
    .replace(/\./g, '@DOT@')  // Заменяем точки
    .replace(/\//g, '_')      // Заменяем слеши
    .replace(/[^a-zA-Z0-9_@-]/g, '') // Удаляем все остальные спецсимволы
    .substring(0, 64);        // Ограничиваем длину
}

function unsafeCallbackData(text) {
  if (!text) return '';
  return text
    .replace(/@DOT@/g, '.')   // Восстанавливаем точки
    .replace(/_/g, '/');      // Восстанавливаем слеши
}

module.exports = {
  safeCallbackData,
  unsafeCallbackData
};

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
    ...otherOptions
  } = finalOptions;

  try {
    let formattedText = text;
    
    if (parse_mode === 'MarkdownV2') {
      formattedText = escapeMarkdown(text);
    }

    await bot.telegram.sendMessage(chatId, formattedText, {
      parse_mode,
      disable_web_page_preview,
      ...otherOptions
    });
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

    if (retryCount > 0) {
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
    await sendMessage(ctxOrBot, chatIdOrText, chunk, {
      ...(typeof textOrOptions === 'object' ? textOrOptions : {}),
      ...(options || {})
    });
    if (chunks.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}

module.exports = {
  sendMessage,
  escapeMarkdown,
  sendLongMessage,
  escapeHtml
};