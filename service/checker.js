const github = require('./github');
const storage = require('./storage');
const { log, logError } = require('../utils/logger');

module.exports = {
  async checkAllRepos(bot) {
    const startTime = Date.now();
    let processedRepos = 0;
    let successfulChecks = 0;
    let failedChecks = 0;

    try {
      const repos = storage.getRepos();
      if (!repos || repos.length === 0) {
        log('Нет репозиториев для проверки', 'info', { 
          context: 'checkAllRepos',
          reposCount: 0 
        });
        return [];
      }

      log(`Начинаем проверку ${repos.length} репозиториев`, 'info', {
        context: 'checkAllRepos',
        reposCount: repos.length,
        repoKeys: repos.map(([key]) => key)
      });

      const updates = [];

      for (const [repoKey, repoData] of repos) {
        processedRepos++;
        try {
          const [owner, repo] = repoKey.split('/');
          const branch = repoData.branch || repoData.defaultBranch || 'main';

          log(`Проверяем ${repoKey} (${branch})`, 'debug', {
            context: 'repoCheck',
            repoKey,
            branch,
            lastCommitSha: repoData.lastCommitSha?.slice(0, 7) || 'none'
          });

          const latestCommit = await github.getBranchLastCommit(owner, repo, branch);

          if (!latestCommit || !latestCommit.sha) {
            logError(`Не удалось получить коммит для ${repoKey}`, null, {
              context: 'repoCheck',
              repoKey,
              branch,
              errorType: 'NO_COMMIT_DATA'
            });
            failedChecks++;
            continue;
          }

          if (!repoData.lastCommitSha) {
            await storage.updateRepoCommit(owner, repo, latestCommit);
            log(`Инициализирован новый репозиторий: ${repoKey}`, 'info', {
              context: 'repoInit',
              repoKey,
              branch,
              newCommitSha: latestCommit.sha.slice(0, 7)
            });
            successfulChecks++;
            continue;
          }

          if (latestCommit.sha !== repoData.lastCommitSha) {
            log(`Обнаружено обновление в ${repoKey}`, 'info', {
              context: 'repoUpdate',
              repoKey,
              branch,
              oldCommitSha: repoData.lastCommitSha.slice(0, 7),
              newCommitSha: latestCommit.sha.slice(0, 7),
              commitMessage: latestCommit.commit.message.split('\n')[0]
            });

            updates.push({
              repoKey,
              branch,
              newSha: latestCommit.sha,
              oldSha: repoData.lastCommitSha,
              message: latestCommit.commit.message.split('\n')[0],
              url: latestCommit.html_url
            });

            await storage.updateRepoCommit(owner, repo, latestCommit);
            await this.sendUpdateNotification(bot, updates[updates.length - 1]);
          }

          successfulChecks++;

        } catch (error) {
          failedChecks++;
          logError(`Ошибка при проверке ${repoKey}`, error, {
            context: 'repoCheck',
            repoKey,
            branch: repoData.branch,
            lastCommitSha: repoData.lastCommitSha?.slice(0, 7),
            errorType: error.response?.status ? 'API_ERROR' : 'NETWORK_ERROR',
            statusCode: error.response?.status,
            responseData: error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : null
          });
        }
      }

      const duration = Date.now() - startTime;
      log('Проверка репозиториев завершена', 'info', {
        context: 'checkAllReposSummary',
        durationMs: duration,
        totalRepos: repos.length,
        processedRepos,
        successfulChecks,
        failedChecks,
        updatesFound: updates.length,
        performance: {
          msPerRepo: duration / repos.length,
          reposPerSecond: (repos.length / (duration / 1000)).toFixed(2)
        }
      });

      return updates;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Критическая ошибка в checkAllRepos', error, {
        context: 'checkAllRepos',
        stack: error.stack,
        timestamp: new Date().toISOString(),
        durationMs: duration,
        processedRepos,
        successfulChecks,
        failedChecks
      });
      return [];
    }
  },

  async sendUpdateNotification(bot, update) {
    try {
      const message = this.formatUpdateMessage(update);
      const keyboard = this.createNotificationKeyboard(update);
      
      const sentMessage = await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        message,
        { 
          disable_web_page_preview: true,
          reply_markup: keyboard,
          parse_mode: 'HTML'
        }
      );

      log('Уведомление отправлено успешно', 'info', {
        context: 'sendUpdateNotification',
        repoKey: update.repoKey,
        branch: update.branch,
        newSha: update.newSha.slice(0, 7),
        buttonsCount: keyboard.inline_keyboard.flat().length,
        messageId: sentMessage.message_id
      });

    } catch (error) {
      logError('Ошибка отправки уведомления', error, {
        context: 'sendUpdateNotification',
        repoKey: update.repoKey,
        chatId: process.env.ADMIN_USER_ID,
        errorMessage: error.message,
        stack: error.stack
      });
    }
  },

  createNotificationKeyboard(update) {
    try {
      const [owner, repo] = update.repoKey.split('/');
      const buttons = [];
      
      // Кнопка просмотра PR (если есть номер PR)
      const prMatch = update.message.match(/#(\d+)/);
      if (prMatch && prMatch[1]) {
        buttons.push([{
          text: "📌 Просмотреть PR",
          callback_data: `prview_${owner}_${repo}_${prMatch[1]}`
        }]);
      }

      // Основные команды
      buttons.push(
  [{
    text: "🌿 3 последних коммита",
    callback_data: `quick_last_${owner}_${repo}_3`
  }],
  [{
    text: "📊 10 активных веток",
    callback_data: `quick_branches_${owner}_${repo}_10`
  }],
  [{
    text: "🔄 10 последних PR",
    callback_data: `quick_pr_${owner}_${repo}_10_open`
  }]
);

      // Кнопка удаления с подтверждением
      buttons.push([{
        text: "❌ Удалить репозиторий",
        callback_data: `confirm_remove_${update.repoKey}`
      }]);

      log('Создана комплексная клавиатура уведомления', 'debug', {
        context: 'createNotificationKeyboard',
        repoKey: update.repoKey,
        hasPRButton: !!prMatch,
        totalButtons: buttons.flat().length
      });

      return { inline_keyboard: buttons };
      
    } catch (error) {
      logError('Ошибка создания клавиатуры', error, {
        context: 'createNotificationKeyboard',
        repoKey: update.repoKey
      });
      return { inline_keyboard: [] };
    }
  },

  formatUpdateMessage(update) {
    const prMatch = update.message.match(/#(\d+)/);
    let prInfo = '';
    
    if (prMatch && prMatch[1]) {
      prInfo = `\n📌 Связанный PR: #${prMatch[1]}`;
    }
    
    return `
🔄 <b>Обновление в ${update.repoKey} (${update.branch})</b>
━━━━━━━━━━━━━━━━━━
<b>Было:</b> <code>${update.oldSha.slice(0, 7)}</code>
<b>Стало:</b> <code>${update.newSha.slice(0, 7)}</code>${prInfo}
📝 ${update.message.substring(0, 100)}
🔗 ${update.url}

<i>Используйте кнопки ниже для быстрых действий:</i>
━━━━━━━━━━━━━━━━━━
    `;
  }
};