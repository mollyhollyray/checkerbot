const storage = require('../service/storage');
const { sendMessage, sendLongMessage } = require('../utils/message');
const { log, logError } = require('../utils/logger');

module.exports = async (ctx) => {
  try {
    const repos = storage.getRepos();
    
    if (repos.length === 0) {
      return await sendMessage(
        ctx,
        '<b>📭 Список отслеживаемых репозиториев пуст</b>\n\n' +
        'Добавьте первый репозиторий командой:\n' +
        '<code>/add владелец/репозиторий</code>',
        { parse_mode: 'HTML' }
      );
    }

    // Группировка репозиториев по владельцам
    const reposByOwner = {};
    repos.forEach(([key, data]) => {
      const [owner, repo] = key.split('/');
      if (!reposByOwner[owner]) reposByOwner[owner] = [];
      reposByOwner[owner].push({
        repo,
        fullName: `${owner}/${repo}`,
        branch: data.defaultBranch || 'main',
        lastCommitSha: data.lastCommitSha,
        addedAt: data.addedAt
      });
    });

    // Формируем заголовок с красивым оформлением
    let message = `
<b>✨ Отслеживаемые репозитории</b>
━━━━━━━━━━━━━━━━━━
<b>📊 Всего:</b> <u>${repos.length}</u> ${getRepoWord(repos.length)}
━━━━━━━━━━━━━━━━━━\n\n
`;

    // Добавляем информацию по каждому репозиторию
    Object.entries(reposByOwner).forEach(([owner, items]) => {
      message += `<b>🌐 ${escapeHtml(owner)}</b>\n`;
      
      items.forEach((item, index) => {
        const isLast = index === items.length - 1;
        message += `
${index === 0 ? '┏' : '┣'} <b>🔹 ${escapeHtml(item.repo)}</b>
${isLast ? '┗' : '┃'} 🌿 Ветка: <code>${escapeHtml(item.branch)}</code>
${isLast ? ' ' : '┃'} 🆔 Коммит: <code>${item.lastCommitSha?.slice(0, 7) || 'unknown'}</code>
${isLast ? ' ' : '┃'} 📅 Добавлен: <i>${formatDate(item.addedAt)}</i>
${isLast ? '' : '┃'}

<code># ${escapeHtml(item.fullName)}</code>
<code>/branch ${escapeHtml(item.fullName)} ${escapeHtml(item.branch)}</code>\n\n`;
      });
    });

    // Добавляем подсказки по командам
    message += `
━━━━━━━━━━━━━━━━━━
<b>💡 Быстрые команды:</b>
<code>/add владелец/репозиторий</code> - добавить репозиторий
<code>/remove владелец/репозиторий</code> - удалить репозиторий
<code>/check все</code> - проверить обновления`;

    await sendLongMessage(ctx, message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    log(`Listed ${repos.length} repositories`, 'info');
  } catch (error) {
    logError(error, 'List command failed');
    await sendMessage(
      ctx,
      '<b>❌ Ошибка при получении списка репозиториев</b>\n' +
      `<code>${escapeHtml(error.message)}</code>`,
      { parse_mode: 'HTML' }
    );
  }
};

// Функция для склонения слова "репозиторий"
function getRepoWord(count) {
  const cases = [2, 0, 1, 1, 1, 2];
  const words = ['репозиторий', 'репозитория', 'репозиториев'];
  return words[
    count % 100 > 4 && count % 100 < 20 ? 2 : cases[Math.min(count % 10, 5)]
  ];
}

// Функция экранирования HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Функция форматирования даты
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'дата неизвестна';
  }
}