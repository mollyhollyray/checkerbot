const { fetchUserRepos, fetchOrgRepos, getAccountType, fetchRepoData } = require('../service/github');
const storage = require('../service/storage-mongo');
const { sendMessage, escapeHtml } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');

function isValidOwner(owner) {
  return owner && /^[a-zA-Z0-9_-]+$/.test(owner) && owner.length <= 50;
}

async function sendNewRepoNotification(bot, owner, repoName) {
  try {
    if (!bot || !bot.telegram) {
      logger.error('Bot instance not available for sending notification', null, {
        context: 'BOT_INSTANCE_MISSING',
        owner,
        repo: repoName
      });
      return;
    }

    const message = `
🎯 <b>Новый репозиторий у отслеживаемого владельца!</b>

👤 <b>Владелец:</b> <code>${owner}</code>
📦 <b>Репозиторий:</b> <code>${repoName}</code>
🔗 <b>Ссылка:</b> https://github.com/${owner}/${repoName}

💡 <i>Репозиторий добавлен в автоматическое отслеживание</i>
    `.trim();

    await bot.telegram.sendMessage(
      config.ADMIN_USER_ID,
      message,
      { 
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }
    );

    logger.log(`Уведомление о новом репозитории отправлено: ${owner}/${repoName}`, 'info', {
      context: 'NEW_REPO_NOTIFICATION',
      owner,
      repo: repoName
    });

  } catch (error) {
    logger.error(`Ошибка отправки уведомления о новом репозитории: ${owner}/${repoName}`, error, {
      context: 'NEW_REPO_NOTIFICATION_ERROR',
      owner,
      repo: repoName,
      hasBot: !!bot,
      hasTelegram: !!(bot && bot.telegram)
    });
  }
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
        'Используйте /list для просмотра всех отслеживаемых владельцев',
        { parse_mode: 'HTML' }
      );
    }

    await ctx.replyWithChatAction('typing');

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

    storage.addOwner(owner);

    let addedCount = 0;
    let skippedCount = 0;
    const addedRepos = [];
    const skippedRepos = [];
    
    logger.log(`Начинаем обработку ${repos.length} репозиториев владельца ${owner}`, 'info', {
      context: 'TRACKOWNER_REPOS_PROCESSING',
      owner,
      totalRepos: repos.length
    });

    for (const repo of repos.slice(0, 30)) {
      const repoKey = `${owner}/${repo.name}`;
      
      const exists = storage.repoExists(owner, repo.name);
      
      if (!exists) {
        try {
          logger.log(`🔄 Обрабатываем новый репозиторий: ${repoKey}`, 'debug', {
            context: 'PROCESSING_NEW_REPO',
            owner,
            repo: repo.name
          });

          const repoData = await fetchRepoData(owner, repo.name);
          
          storage.addRepoFromOwner(owner, repo.name, {
            lastCommitSha: repoData.lastCommitSha,
            lastCommitTime: repoData.lastCommitTime,
            defaultBranch: repoData.defaultBranch,
            isEmpty: repoData.isEmpty || false
          });
          
          addedCount++;
          addedRepos.push({
            name: repo.name,
            defaultBranch: repoData.defaultBranch,
            lastCommit: repoData.lastCommitSha ? `${repoData.lastCommitSha.slice(0, 7)}` : 'нет коммитов',
            isEmpty: repoData.isEmpty || false
          });

          const statusEmoji = repoData.isEmpty ? '📭' : '✅';
          logger.log(`${statusEmoji} Добавлен ${repoData.isEmpty ? 'пустой ' : ''}репозиторий от владельца: ${repoKey}`, 'info', {
            context: 'NEW_REPO_ADDED',
            owner,
            repo: repo.name,
            repoKey,
            defaultBranch: repoData.defaultBranch,
            firstCommit: repoData.lastCommitSha ? repoData.lastCommitSha.slice(0, 7) : 'нет данных',
            isEmpty: repoData.isEmpty,
            addTime: new Date().toLocaleString('ru-RU')
          });

          if (!repoData.isEmpty) {
            const botInstance = ctx.bot || global.botInstance;
            if (botInstance) {
              await sendNewRepoNotification(botInstance, owner, repo.name);
            } else {
              logger.warn('Bot instance not available for notification', {
                context: 'NO_BOT_INSTANCE',
                owner,
                repo: repo.name
              });
            }
          }

        } catch (repoError) {
          logger.error(`❌ Ошибка при добавлении репозитория ${repoKey}`, repoError, {
            context: 'NEW_REPO_ERROR',
            owner,
            repo: repo.name,
            errorType: repoError.response?.status ? 'API_ERROR' : 'NETWORK_ERROR',
            statusCode: repoError.response?.status,
            timestamp: new Date().toLocaleString('ru-RU')
          });
        }
      } else {
        skippedCount++;
        skippedRepos.push(repo.name);
        logger.log(`⏭️ Пропускаем существующий репозиторий: ${repoKey}`, 'debug', {
          context: 'SKIP_EXISTING_REPO',
          owner,
          repo: repo.name
        });
      }
    }

    storage.updateOwnerReposCount(owner, addedCount);

    logger.log(`✅ Обработка владельца ${owner} завершена`, 'info', {
      context: 'TRACKOWNER_COMPLETE',
      owner,
      accountType,
      addedCount,
      skippedCount,
      totalRepos: repos.length,
      addedRepos: addedRepos.map(r => ({
        name: r.name,
        isEmpty: r.isEmpty
      })),
      skippedRepos: skippedRepos,
      timestamp: new Date().toLocaleString('ru-RU')
    });

    let userMessage = `<b>✅ Владелец добавлен в отслеживание</b>\n\n` +
      `<b>▸ Имя:</b> <code>${escapeHtml(owner)}</code>\n` +
      `<b>▸ Тип:</b> ${accountType}\n` +
      `<b>▸ Добавлено репозиториев:</b> ${addedCount}\n` +
      `<b>▸ Пропущено (уже отслеживаются):</b> ${skippedCount}\n` +
      `<b>▸ Всего репозиториев:</b> ${repos.length}\n\n`;

    if (addedCount > 0) {
      userMessage += `<b>📦 Добавленные репозитории:</b>\n`;
      addedRepos.forEach(repo => {
        const emoji = repo.isEmpty ? '📭' : '✅';
        userMessage += `${emoji} <code>${repo.name}</code>\n`;
      });
      userMessage += `\n`;
    }

    userMessage += `<i>Автоматически отслеживаются все публичные репозитории</i>`;

    await sendMessage(ctx, userMessage, { parse_mode: 'HTML' });

  } catch (error) {
    logger.error(`Ошибка в команде /trackowner для владельца: ${args?.[0] || 'unknown'}`, error, {
      context: 'TRACKOWNER_COMMAND_ERROR',
      owner: args?.[0] || 'unknown',
      errorType: error.response?.status ? 'API_ERROR' : 'NETWORK_ERROR',
      statusCode: error.response?.status,
      timestamp: new Date().toLocaleString('ru-RU')
    });
    
    let errorMessage = '<b>❌ Ошибка при добавлении владельца</b>';
    if (error.response?.status === 404) {
      errorMessage += '\n\nВладелец не найден или не существует';
    } else {
      errorMessage += `\n\n<code>${escapeHtml(error.message)}</code>`;
    }

    await sendMessage(ctx, errorMessage, { parse_mode: 'HTML' });
  }
};