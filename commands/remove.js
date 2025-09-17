const { log, logError } = require('../utils/logger');
const { sendMessage } = require('../utils/message');
const storage = require('../service/storage');
const { escapeHtml } = require('../utils/message');

function isValidRepoFormat(repoInput) {
    return repoInput && 
           repoInput.includes('/') && 
           repoInput.split('/').length === 2 &&
           repoInput.split('/')[0].length > 0 &&
           repoInput.split('/')[1].length > 0;
}

function sanitizeRepoInput(repoInput) {
    return repoInput.replace(/[^a-zA-Z0-9_\-\.\/]/g, '').toLowerCase();
}

module.exports = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 1 || !isValidRepoFormat(args[0])) {
      return await sendMessage(
        ctx,
        '<b>❌ Неверный формат команды</b>\n\n' +
        '<i>Формат:</i> <code>/remove &lt;owner/repo&gt;</code>\n\n' +
        '<i>Пример:</i>\n' +
        '<code>/remove facebook/react</code>\n\n' +
        '<b>Разрешены только:</b> буквы, цифры, дефисы и подчеркивания',
        { parse_mode: 'HTML' }
      );
    }

    const sanitizedInput = sanitizeRepoInput(args[0]);
    const [owner, repo] = sanitizedInput.split('/');
    const repoKey = `${owner}/${repo}`.toLowerCase();

    if (!storage.repoExists(owner, repo)) {
      return await sendMessage(
        ctx,
        `<b>❌ Репозиторий <code>${escapeHtml(repoKey)}</code> не отслеживается</b>\n\n` +
        'Используйте /list для просмотра отслеживаемых репозиториев',
        { parse_mode: 'HTML' }
      );
    }

    // Используем ту же систему подтверждения, что и для кнопок
    await sendMessage(
      ctx,
      `⚠️ <b>Подтвердите удаление репозитория</b>\n\n` +
      `<code>${escapeHtml(repoKey)}</code>\n\n` +
      `Это действие нельзя отменить. Удалить репозиторий?`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { 
                text: "✅ Да, удалить навсегда", 
                callback_data: `final_remove_${repoKey}`
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