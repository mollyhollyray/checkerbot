const storage = require('../service/storage');
const { sendMessage, escapeHtml } = require('../utils/message');
const { log } = require('../utils/logger');

module.exports = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    const owner = args[0];

    if (!owner) {
      return await sendMessage(
        ctx,
        '<b>❌ Неверный формат команды</b>\n\n' +
        '<i>Использование:</i> <code>/untrackowner username</code>\n\n' +
        '<i>Пример:</i> <code>/untrackowner facebook</code>',
        { parse_mode: 'HTML' }
      );
    }

    if (!storage.ownerExists(owner)) {
      return await sendMessage(
        ctx,
        `<b>❌ Владелец <code>${escapeHtml(owner)}</code> не отслеживается</b>`,
        { parse_mode: 'HTML' }
      );
    }

    storage.removeOwner(owner);
    const repos = storage.getReposByOwner(owner);
    
    for (const [repoKey, repoData] of repos) {
      if (!repoData.trackedIndividually) {
        const [repoOwner, repoName] = repoKey.split('/');
        storage.removeRepo(repoOwner, repoName);
      }
    }

    await sendMessage(
      ctx,
      `<b>✅ Владелец удален из отслеживания</b>\n\n` +
      `<code>${escapeHtml(owner)}</code>\n` +
      `Удалено репозиториев: ${repos.length}\n` +
      `🕒 ${new Date().toLocaleString('ru-RU')}`,
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    log(error, 'Untrackowner command failed');
    await sendMessage(
      ctx,
      '❌ Ошибка при удалении владельца',
      { parse_mode: 'HTML' }
    );
  }
};