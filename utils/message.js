const { logError } = require('./logger');

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+-={}.!]/g, '\\$&');
}

async function sendLongMessage(bot, chatId, text, options = {}) {
  const MAX_LENGTH = 4000;
  const chunks = [];
  
  while (text.length > 0) {
    chunks.push(text.substring(0, MAX_LENGTH));
    text = text.substring(MAX_LENGTH);
  }
  
  for (const chunk of chunks) {
    await bot.telegram.sendMessage(chatId, chunk, options);
    if (chunks.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}

async function sendMessage(bot, chatId, text, options = {}) {
  const {
    parse_mode = 'MarkdownV2',
    disable_web_page_preview = true,
    retryCount = 2
  } = options;

  try {
    let formattedText = text;
    
    if (parse_mode === 'MarkdownV2') {
      formattedText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        return `[${escapeMarkdown(text)}](${url})`;
      });
      
      const parts = formattedText.split(/(\[[^\]]+\]\([^)]+\))/g);
      formattedText = parts.map(part => {
        return part.match(/^\[.*\]\(.*\)$/) ? part : escapeMarkdown(part);
      }).join('');
    }

    await bot.telegram.sendMessage(chatId, formattedText, {
      parse_mode,
      disable_web_page_preview
    });
    return true;
  } catch (error) {
    if (retryCount > 0) {
      return sendMessage(bot, chatId, text, { ...options, retryCount: retryCount - 1 });
    }

    logError(error, 'Failed to send message');
    
    try {
      await bot.telegram.sendMessage(chatId, text, { 
        disable_web_page_preview: true 
      });
      return true;
    } catch (fallbackError) {
      logError(fallbackError, 'Fallback message failed');
      return false;
    }
  }
}

module.exports = {
  sendMessage,
  escapeMarkdown,
  sendLongMessage
};