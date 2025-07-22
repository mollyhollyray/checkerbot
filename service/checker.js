const github = require('./github');
const storage = require('./storage');
const { sendMessage } = require('../utils/message');
const { log, logError } = require('../utils/logger');
const config = require('../config');

module.exports = {
  async checkAllRepos(bot) {
    const repos = storage.getRepos();
    if (repos.length === 0) {
      log('Нет репозиториев для проверки');
      return [];
    }

    log(`🔍 Запуск проверки ${repos.length} репозиториев...`);
    const updates = [];
    let checkedCount = 0;

    for (const [fullName, repoData] of repos) {
      const [owner, repo] = fullName.split('/');
      const branch = repoData.defaultBranch || repoData.branch || 'main';

      try {
        log(`Проверка ${fullName} (${branch})...`);
        const startTime = Date.now();
        
        const latestCommit = await github.getBranchLastCommit(owner, repo, branch);
        const duration = Date.now() - startTime;

        if (!latestCommit) {
          logError(`Ветка ${branch} не найдена в репозитории ${fullName}`);
          await bot.telegram.sendMessage(
            config.ADMIN_USER_ID,
            `❌ Ветка ${branch} не найдена в репозитории ${fullName}`
          );
          continue;
        }

        if (!repoData.lastCommitSha) {
          log(`✅ Инициализация: ${fullName} @ ${latestCommit.sha.slice(0, 7)} [${duration}ms]`);
          await storage.updateRepoCommit(owner, repo, latestCommit);
        } 
        else if (latestCommit.sha !== repoData.lastCommitSha) {
          updates.push({
            repo: fullName,
            branch,
            commit: latestCommit,
            previous: repoData.lastCommitSha
          });
          log(`🆕 Обновление: ${fullName} ${repoData.lastCommitSha.slice(0, 7)}→${latestCommit.sha.slice(0, 7)} [${duration}ms]`);
        } else {
          log(`✓ Актуально: ${fullName} [${duration}ms]`);
        }

        checkedCount++;
      } catch (error) {
        logError(`❌ Ошибка проверки ${fullName}: ${error.message}`);
        await bot.telegram.sendMessage(
          config.ADMIN_USER_ID,
          `❌ Ошибка проверки ${fullName}: ${error.message}`
        );
      }
    }

    log(`Проверка завершена. Обновлений: ${updates.length}/${checkedCount}`);
    if (updates.length > 0) await this.notifyUpdates(bot, updates);
    return updates;
  },

  async notifyUpdates(bot, updates) {
    for (const update of updates) {
      try {
        const message = this.formatUpdateMessage(update);
        await bot.telegram.sendMessage(
          config.ADMIN_USER_ID, 
          message,
          { parse_mode: 'HTML' }
        );
        log(`Уведомление отправлено: ${update.repo}`);
      } catch (error) {
        logError(`Ошибка отправки уведомления: ${error.message}`);
      }
    }
  },

  formatUpdateMessage(update) {
    const commitMessage = update.commit.commit.message.split('\n')[0];
    return `
📌 <b>Новый коммит в ${update.repo}</b> (${update.branch})
━━━━━━━━━━━━━━━━━━
<code>${update.commit.sha.slice(0, 7)}</code> ${escapeHtml(commitMessage)}

👤 ${update.commit.commit.author.name}
📅 ${formatDate(update.commit.commit.author.date)}
━━━━━━━━━━━━━━━━━━
<a href="${update.commit.html_url}">🔗 Просмотреть изменения</a>
    `;
  }
};

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}