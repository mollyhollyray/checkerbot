const { fetchUserRepos, fetchOrgRepos, getAccountType, fetchRepoData } = require('../service/github');
const storage = require('../service/storage');
const { sendMessage, escapeHtml } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');

function isValidOwner(owner) {
  return owner && /^[a-zA-Z0-9_-]+$/.test(owner) && owner.length <= 50;
}

module.exports = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    const owner = args[0];

    if (!owner || !isValidOwner(owner)) {
      return await sendMessage(
        ctx,
        '<b>❌ Неверный формат команды</b>\n\n' +
        '<i>Использование:</i> <code>/trackowner username</code>\n\n' +
        '<i>Примеры:</i>\n' +
        '<code>/trackowner facebook</code>\n' +
        '<code>/trackowner google</code>\n\n' +
        '⚠️ <b>Будет отслеживать все публичные репозитории владельца</b>',
        { parse_mode: 'HTML' }
      );
    }

    if (storage.ownerExists(owner)) {
      return await sendMessage(
        ctx,
        `<b>❌ Владелец <code>${escapeHtml(owner)}</code> уже отслеживается</b>\n\n` +
        'Используйте /listowners для просмотра всех отслеживаемых владельцев',
        { parse_mode: 'HTML' }
      );
    }

    await ctx.replyWithChatAction('typing');

    // Получаем тип аккаунта
    const accountType = await getAccountType(owner);
    let repos = [];

    if (accountType === 'Organization') {
      repos = await fetchOrgRepos(owner, 50);
    } else {
      repos = await fetchUserRepos(owner, 50);
    }

    if (!repos.length) {
      return await sendMessage(
        ctx,
        `<b>❌ У владельца <code>${escapeHtml(owner)}</code> нет публичных репозиториев</b>`,
        { parse_mode: 'HTML' }
      );
    }

    // Добавляем владельца
    storage.addOwner(owner);

    // Добавляем репозитории
    let addedCount = 0;
    for (const repo of repos.slice(0, 30)) { // Ограничиваем 30 репозиториями
      if (!storage.repoExists(owner, repo.name)) {
        const repoData = await fetchRepoData(owner, repo.name);
        storage.addRepoFromOwner(owner, repo.name, {
          lastCommitSha: repoData.lastCommitSha,
          lastCommitTime: repoData.lastCommitTime,
          defaultBranch: repoData.defaultBranch
        });
        addedCount++;
      }
    }

    storage.updateOwnerReposCount(owner, addedCount);

    await sendMessage(
      ctx,
      `<b>✅ Владелец добавлен в отслеживание</b>\n\n` +
      `<b>▸ Имя:</b> <code>${escapeHtml(owner)}</code>\n` +
      `<b>▸ Тип:</b> ${accountType}\n` +
      `<b>▸ Добавлено репозиториев:</b> ${addedCount}\n` +
      `<b>▸ Всего репозиториев:</b> ${repos.length}\n\n` +
      `<i>Автоматически отслеживаются все публичные репозитории</i>`,
      { parse_mode: 'HTML' }
    );

    log(`Добавлен владелец: ${owner} с ${addedCount} репозиториями`, 'info');

  } catch (error) {
    logger.error(error, 'Trackowner command failed');
    
    let errorMessage = '<b>❌ Ошибка при добавлении владельца</b>';
    if (error.response?.status === 404) {
      errorMessage += '\n\nВладелец не найден или не существует';
    } else {
      errorMessage += `\n\n<code>${escapeHtml(error.message)}</code>`;
    }

    await sendMessage(ctx, errorMessage, { parse_mode: 'HTML' });
  }
};