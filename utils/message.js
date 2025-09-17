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
    logger.error('Не указан бот или chatId'); // Исправлено: errorr -> error
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
    parse_mode = 'HTML', // Изменено по умолчанию на HTML
    disable_web_page_preview = true,
    retryCount = 2,
    ...otherOptions
  } = finalOptions;

  try {
    let formattedText = text;
    
    // Применяем экранирование только для Markdown
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
  
  // Упрощенное получение текста
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