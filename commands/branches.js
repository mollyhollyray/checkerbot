const { fetchRepoBranches, getBranchLastCommit, getDefaultBranch, getTotalBranchesCount } = require('../service/github');
const { sendMessage, sendLongMessage } = require('../utils/message');
const { log, logError } = require('../utils/logger');

// Константы
const DEFAULT_BRANCHES_LIMIT = 15;
const MAX_BRANCHES_LIMIT = 50;

// Кастомное экранирование (без обработки - и /)
function customEscape(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!]/g, '\\$&');
}

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    
    // Валидация формата команды
    if (!args[0]?.includes('/')) {
        return sendMessage(
            ctx,
            '❌ Неверный формат\n' +
            'Используйте: /branches владелец/репозиторий [количество=15]\n' +
            'Примеры:\n' +
            '/branches facebook/react\n' +
            '/branches vuejs/core 25',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const [owner, repo] = args[0].split('/');
    const repoName = `${owner}/${repo}`; // Не экранируем путь к репозиторию
    let limit = DEFAULT_BRANCHES_LIMIT;

    // Парсинг количества веток
    if (args.length >= 2 && !isNaN(args[1])) {
        limit = Math.min(parseInt(args[1]), MAX_BRANCHES_LIMIT);
    }

    try {
        // Получаем данные параллельно
        const [totalBranches, branches, defaultBranch] = await Promise.all([
            getTotalBranchesCount(owner, repo),
            fetchRepoBranches(owner, repo, limit),
            getDefaultBranch(owner, repo)
        ]);

        // Проверка наличия веток
        if (!branches?.length) {
            return sendMessage(
                ctx,
                `🌿 ${repoName}\n\n` +
                'В репозитории не найдено веток',
                { parse_mode: 'HTML' }
            );
        }

        // Получаем информацию о коммитах
        const branchesWithStatus = await Promise.all(
            branches.map(async branch => {
                const commit = await getBranchLastCommit(owner, repo, branch);
                return {
                    name: branch,
                    lastCommit: commit?.commit?.author?.date,
                    lastCommitSha: commit?.sha,
                    commitUrl: commit?.html_url || ''
                };
            })
        );
        
        // Сортировка
        branchesWithStatus.sort((a, b) => {
            if (a.name === defaultBranch) return -1;
            if (b.name === defaultBranch) return 1;
            return new Date(b.lastCommit) - new Date(a.lastCommit);
        });

        // Формируем сообщение
        let message = `🌳 <b>${repoName}</b> 🌳\n` +
                     `📊 <b>Всего веток:</b> ${totalBranches} (показано ${branches.length})\n` +
                     '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n\n';

        branchesWithStatus.forEach(branch => {
            const isDefault = branch.name === defaultBranch;
            const statusEmoji = getBranchEmoji(branch.lastCommit);
            const shortSha = branch.lastCommitSha?.slice(0, 7) || 'unknown';
            const date = branch.lastCommit ? formatDate(branch.lastCommit) : 'неизвестно';
            
            message += `${isDefault ? '👑' : '▸'} <b>${branch.name}</b> ` +
                      (isDefault ? '(по умолчанию)' : '') + '\n' +
                      `   ${statusEmoji} Последний коммит: ${date}\n` +
                      `   🆔 ${shortSha} <a href="${branch.commitUrl}">Ссылка</a>\n\n`;
        });

        message += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n' +
                  `Для просмотра коммитов: /last ${repoName} [ветка]\n` +
                  `Чтобы показать больше веток: /branches ${repoName} [количество]`;

        // Отправляем в HTML-режиме
        await sendLongMessage(ctx, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    } catch (error) {
        logError(error, `Branches command failed: ${owner}/${repo}`);
        await sendMessage(
            ctx,
            `❌ Ошибка: ${error.message}`,
            { parse_mode: 'HTML' }
        );
    }
};

// Остальные функции без изменений
function getBranchEmoji(lastCommitDate) {
    if (!lastCommitDate) return '🔴';
    const daysDiff = (Date.now() - new Date(lastCommitDate)) / (1000 * 60 * 60 * 24);
    if (daysDiff < 7) return '🟢';
    if (daysDiff < 30) return '🟡';
    return '🔴';
}

function formatDate(dateString) {
    if (!dateString) return 'неизвестно';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}