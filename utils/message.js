const { logError } = require('./logger');

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+-={}.!]/g, '\\$&');
}

async function sendLongMessage(ctx, text, options = {}) {
    const MAX_LENGTH = 4000;
    const chunks = [];
    
    while (text.length > 0) {
        chunks.push(text.substring(0, MAX_LENGTH));
        text = text.substring(MAX_LENGTH);
    }
    
    for (const chunk of chunks) {
        await ctx.reply(chunk, options);
        if (chunks.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
}

async function sendMessage(ctx, text, options = {}) {
  const {
    parse_mode = 'MarkdownV2',
    disable_web_page_preview = true,
    retryCount = 2
  } = options;

  try {
    let formattedText = text;
    
    if (parse_mode === 'MarkdownV2') {
      // Экранируем текст, но сохраняем ссылки
      formattedText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        return `[${escapeMarkdown(text)}](${url})`;
      });
      
      // Экранируем остальной текст
      const parts = formattedText.split(/(\[[^\]]+\]\([^)]+\))/g);
      formattedText = parts.map(part => {
        return part.match(/^\[.*\]\(.*\)$/) ? part : escapeMarkdown(part);
      }).join('');
    }

    await ctx.reply(formattedText, {
      parse_mode,
      disable_web_page_preview
    });
    return true;
  } catch (error) {
    if (retryCount > 0) {
      return sendMessage(ctx, text, { ...options, retryCount: retryCount - 1 });
    }

    logError(error, 'Failed to send message');
    
    // Фолбэк: plain text
    try {
      await ctx.reply(text, { disable_web_page_preview: true });
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