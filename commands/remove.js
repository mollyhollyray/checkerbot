const { log, logError } = require('../utils/logger');
const { sendMessage } = require('../utils/message');
const storage = require('../service/storage');
const { escapeHtml } = require('../utils/message');

module.exports = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 1 || !args[0].includes('/')) {
      return await sendMessage(
        ctx,
        '<b>❌ Неверный формат команды</b>\n\n' +
        '<i>Формат:</i> <code>/remove &lt;owner/repo&gt;</code>\n\n' +
        '<i>Пример:</i>\n' +
        '<code>/remove facebook/react</code>',
        { parse_mode: 'HTML' }
      );
    }

    const [owner, repo] = args[0].split('/');
    const repoKey = `${owner}/${repo}`.toLowerCase();

    await sendMessage(
      ctx,
      `⚠️ <b>Подтвердите удаление репозитория</b>\n\n` +
      `<code>${escapeHtml(repoKey)}</code>\n\n` +
      `Будут удалены все данные отслеживания.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { 
                text: "✅ Да, удалить", 
                callback_data: `confirm_remove_${repoKey}`
              },
              { 
                text: "❌ Отмена", 
                callback_data: "cancel_remove"
              }
            ]
          ]
        }
      }
    );

  } catch (error) {
    logError(error, 'Remove command failed');
    await sendMessage(
      ctx,
      '❌ <b>Ошибка при удалении</b>\n\n' +
      `<code>${escapeHtml(error.message)}</code>`,
      { parse_mode: 'HTML' }
    );
  }
};
