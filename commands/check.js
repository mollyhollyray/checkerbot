const checker = require('../service/checker');
const { sendMessage, sendLongMessage } = require('../utils/message');
const logger = require('../utils/logger');
const storage = require('../service/storage');

module.exports = async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    const startTime = Date.now();
    
    // Получаем текущее состояние репозиториев до проверки
    const reposBeforeCheck = storage.getRepos().map(([repo, data]) => ({
      repo,
      lastSha: data.lastCommitSha
    }));

    // Запускаем проверку
    const updates = await checker.checkAllRepos(ctx.bot);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Формируем детальный отчет
    let message = `🔄 <b>Результаты проверки</b> (${duration} сек)\n\n`;
    
    if (updates.length > 0) {
      message += `✅ <b>Найдено обновлений:</b> ${updates.length}\n\n`;
      
      // Добавляем информацию по каждому обновлению
      updates.forEach(update => {
        const repoData = reposBeforeCheck.find(r => r.repo === update.repoKey);
        message += 
`📌 <b>${escapeHtml(update.repoKey)}</b> (${escapeHtml(update.branch)})
├ 🔄 Было: <code>${repoData?.lastSha?.substring(0, 7) || 'нет данных'}</code>
├ 🆕 Стало: <code>${update.newCommitSha.substring(0, 7)}</code>
├ 👤 Автор: ${escapeHtml(update.commitAuthor)}
├ 📝 Сообщение: ${escapeHtml(update.commitMessage.split('\n')[0])}
└ 🔗 <a href="${update.commitUrl}">Подробнее</a>\n\n`;
      });
    } else {
      message += 'ℹ️ Все репозитории актуальны, обновлений не найдено\n';
    }

    // Добавляем список всех проверенных репозиториев
    message += '\n<b>Проверенные репозитории:</b>\n';
    storage.getRepos().forEach(([repo, data]) => {
      message += `▸ ${escapeHtml(repo)} (${escapeHtml(data.branch)})\n`;
    });

    await sendLongMessage(ctx, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

  } catch (error) {
    logger.error(error, 'Ручная проверка');
    await sendMessage(
      ctx,
      '❌ Ошибка при проверке\n' +
      `<code>${escapeHtml(error.message)}</code>`,
      { parse_mode: 'HTML' }
    );
  }
};

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}