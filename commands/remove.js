const { log, logError } = require('../utils/logger');
const { sendMessage } = require('../utils/message');
const storage = require('../service/storage'); // Только storage

module.exports = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    // Проверка формата команды
    if (args.length < 1 || !args[0].includes('/')) {
      return await sendMessage(
        ctx,
        '<b>❌ Неверный формат команды</b>\n\n' +
        '<i>Формат:</i> <code>/remove &lt;владелец/репозиторий&gt;</code>\n\n' +
        '<i>Пример:</i>\n' +
        '<code>/remove facebook/react</code>',
        { parse_mode: 'HTML' }
      );
    }

    const [owner, repo] = args[0].split('/');
    const repoKey = `${owner}/${repo}`.toLowerCase();

    // Удаление из хранилища
    if (storage.removeRepo(owner, repo)) {
      await sendMessage(
        ctx,
        `✅ <b>Репозиторий удалён из отслеживания!</b>\n\n` +
        `📂 <code>${escapeHtml(repoKey)}</code>\n` +
        `🕒 ${formatDate(new Date())}\n\n` +
        `Для повторного добавления: <code>/add ${escapeHtml(repoKey)}</code>`,
        { parse_mode: 'HTML' }
      );
      log(`Repo removed: ${repoKey}`, 'success');
    } else {
      await sendMessage(
        ctx,
        `ℹ️ <b>Репозиторий не найден в отслеживаемых</b>\n\n` +
        `<code>${escapeHtml(repoKey)}</code>\n\n` +
        `Проверьте список: /list`,
        { parse_mode: 'HTML' }
      );
    }

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

// Форматирование даты
function formatDate(date) {
  return date.toLocaleString('ru-RU', { 
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Экранирование HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}