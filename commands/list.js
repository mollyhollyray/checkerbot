const storage = require('../service/storage');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const { log } = require('../utils/logger');

module.exports = async (ctx) => {
  try {
    const repos = storage.getRepos();
    
    if (repos.length === 0) {
      return sendMessage(
        ctx,
        '📭 Список отслеживаемых репозиториев пуст\n\n' +
        'Добавьте первый репозиторий командой:\n' +
        '`/add владелец/репозиторий`',
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Группируем по владельцам
    const reposByOwner = {};
    repos.forEach(([key, data]) => {
      const [owner, repo] = key.split('/');
      if (!reposByOwner[owner]) reposByOwner[owner] = [];
      
      // Добавляем гарантированное значение для ветки
      reposByOwner[owner].push({ 
        repo,
        branch: data.defaultBranch || 'main', // Фолбэк значение
        ...data 
      });
    });

    // Формируем сообщение
    let message = '✨ *Отслеживаемые репозитории* ✨\n\n';
    
    Object.entries(reposByOwner).forEach(([owner, items]) => {
      message += `🌐 *${escapeMarkdown(owner)}*\n`;
      
      items.forEach(item => {
        message += `┌ 🔹 *${escapeMarkdown(item.repo)}*\n`;
        message += `├ 🌿 Ветка: \`${item.branch}\`\n`; // Используем гарантированное поле
        message += `├ 🆔 Последний коммит: \`${item.lastCommitSha?.slice(0, 7) || 'unknown'}\`\n`;
        message += `└ 📅 Добавлен: ${formatDate(item.addedAt)}\n\n`;
      });
    });

    await sendMessage(ctx, message, { parse_mode: 'MarkdownV2' });
    log(`Listed ${repos.length} repositories`, 'info');
  } catch (error) {
    logError(error, 'List command failed');
    await sendMessage(ctx, '❌ Не удалось получить список репозиториев');
  }
};

function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'дата неизвестна';
  }
}