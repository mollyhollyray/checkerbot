const github = require('./github');
const storage = require('./storage');
const { log, logError } = require('../utils/logger');

module.exports = {
  async checkAllRepos(bot) {
    try {
      const repos = storage.getRepos();
      if (!repos || repos.length === 0) {
        log('Нет репозиториев для проверки');
        return [];
      }

      log(`Начинаем проверку ${repos.length} репозиториев`);
      const updates = [];

      for (const [repoKey, repoData] of repos) {
        try {
          const [owner, repo] = repoKey.split('/');
          const branch = repoData.branch || repoData.defaultBranch || 'main';

          log(`Проверяем ${repoKey} (${branch})`);
          const latestCommit = await github.getBranchLastCommit(owner, repo, branch);

          if (!latestCommit || !latestCommit.sha) {
            logError(`Не удалось получить коммит для ${repoKey}`);
            continue;
          }

          if (!repoData.lastCommitSha) {
            await storage.updateRepoCommit(owner, repo, latestCommit);
            log(`Инициализирован новый репозиторий: ${repoKey}`);
            continue;
          }

          if (latestCommit.sha !== repoData.lastCommitSha) {
            log(`Обнаружено обновление в ${repoKey}`);
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
        } catch (error) {
          logError(`Ошибка при проверке ${repoKey}: ${error.message}`);
        }
      }

      log(`Проверка завершена. Обновлений: ${updates.length}`);
      return updates;
    } catch (error) {
      logError(`Критическая ошибка в checkAllRepos: ${error.message}`);
      return [];
    }
  },

  async sendUpdateNotification(bot, update) {
    try {
      const message = this.formatUpdateMessage(update);
      await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        message,
        { disable_web_page_preview: true }
      );
    } catch (error) {
      logError(`Ошибка отправки уведомления: ${error.message}`);
    }
  },

  formatUpdateMessage(update) {
    return `
🔄 Обновление в ${update.repoKey} (${update.branch})
━━━━━━━━━━━━━━━━━━
Было: ${update.oldSha.slice(0, 7)}
Стало: ${update.newSha.slice(0, 7)}

📝 ${update.message.substring(0, 100)}
🔗 ${update.url}

/last ${update.repoKey} ${update.branch} 5
━━━━━━━━━━━━━━━━━━
    `;
  }
};