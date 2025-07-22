const github = require('./github');
const storage = require('./storage');
const { log, logError } = require('../utils/logger');
const config = require('../config');
const { formatDistanceToNow } = require('date-fns');
const { ru } = require('date-fns/locale');

module.exports = {
  async checkAllRepos(bot) {
    const repos = storage.getRepos();
    if (repos.length === 0) {
      log('Нет репозиториев для проверки');
      return [];
    }

    log(`🔍 Проверка ${repos.length} репозиториев...`);
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
          logError(`Ветка ${branch} не найдена в ${fullName}`);
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
      }
    }

    log(`Проверка завершена. Обновлений: ${updates.length}/${checkedCount}`);
    if (updates.length > 0) await this.notifyUpdates(bot, updates);
    return updates;
  },

  async notifyUpdates(bot, updates) {
    for (const update of updates) {
      try {
        const message = this.formatCommitMessage(update);
        await bot.telegram.sendMessage(
          config.ADMIN_USER_ID,
          message,
          { parse_mode: 'HTML', disable_web_page_preview: true }
        );
        log(`Уведомление отправлено: ${update.repo}`);
      } catch (error) {
        logError(`Ошибка отправки уведомления: ${error.message}`);
      }
    }
  },

  formatCommitMessage(update) {
    const commit = update.commit;
    const commitDate = new Date(commit.commit.committer.date);
    const firstLine = commit.commit.message.split('\n')[0];
    const otherLines = commit.commit.message.split('\n').slice(1).join('\n').trim();
    const timeAgo = formatDistanceToNow(commitDate, { addSuffix: true, locale: ru });

    return `
<b>🆕 Новый коммит в ${update.repo}</b> (<code>${update.branch}</code>)
━━━━━━━━━━━━━━━━━━
<code>${commit.sha.slice(0, 7)}</code> <b>${escapeHtml(firstLine)}</b>

${otherLines ? `<pre>${escapeHtml(otherLines)}</pre>` : ''}

👤 <b>Автор:</b> ${commit.commit.author.name}
⏱ <b>Время:</b> ${timeAgo} (${commitDate.toLocaleString('ru-RU')})
🔗 <a href="${commit.html_url}">Просмотреть коммит</a>
━━━━━━━━━━━━━━━━━━
<code>/last ${update.repo} ${update.branch} 3</code> - показать последние 3 коммита
    `;
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