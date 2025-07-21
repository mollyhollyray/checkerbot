const { fetchRepoBranches, getBranchLastCommit, getDefaultBranch } = require('../service/github');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const { log, logError } = require('../utils/logger');

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (!args[0]?.includes('/')) {
        return sendMessage(
            ctx,
            '❌ *Неверный формат*\n' +
            'Используйте: `/branches владелец/репозиторий`\n' +
            'Пример: `/branches facebook/react`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const [owner, repo] = args[0].split('/');
    const repoName = `${owner}/${repo}`;

    try {
        // Параллельно получаем ветки и ветку по умолчанию
        const [branches, defaultBranch] = await Promise.all([
            fetchRepoBranches(owner, repo),
            getDefaultBranch(owner, repo)
        ]);

        if (!branches?.length) {
            return sendMessage(
                ctx,
                `🌿 *${escapeMarkdown(repoName)}*\n\n` +
                'В репозитории не найдено веток',
                { parse_mode: 'MarkdownV2' }
            );
        }

        // Получаем последние коммиты для каждой ветки
        const branchesWithStatus = await getBranchesStatus(owner, repo, branches);

        // Формируем сообщение
        let message = `🌳 *Ветки репозитория ${escapeMarkdown(repoName)}* 🌳\n\n`;
        
        // Сортируем: сначала ветка по умолчанию, затем по активности
        branchesWithStatus.sort((a, b) => {
            if (a.name === defaultBranch) return -1;
            if (b.name === defaultBranch) return 1;
            return new Date(b.lastCommit) - new Date(a.lastCommit);
        });

        // Добавляем ветки в сообщение
        branchesWithStatus.forEach(branch => {
            const isDefault = branch.name === defaultBranch;
            const statusEmoji = getBranchEmoji(branch.lastCommit);
            
            message += `${isDefault ? '👑' : '└'} *${escapeMarkdown(branch.name)}* ` +
                      `${isDefault ? '(по умолчанию)' : ''}\n` +
                      `   ${statusEmoji} Последний коммит: ${formatDate(branch.lastCommit)}\n` +
                      `   🆔 ${branch.lastCommitSha?.slice(0, 7) || 'unknown'}\n\n`;
        });

        message += `📊 Всего веток: *${branches.length}*\n\n` +
                  `Для просмотра коммитов: \`/last ${escapeMarkdown(repoName)} [ветка]\``;

        await sendMessage(ctx, message, { 
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true
        });

    } catch (error) {
        logError(error, `Branches command failed: ${repoName}`);
        await handleBranchError(ctx, error, repoName);
    }
};

// Получаем статус для всех веток
async function getBranchesStatus(owner, repo, branches) {
    const requests = branches.map(async branch => {
        const commit = await getBranchLastCommit(owner, repo, branch);
        return {
            name: branch,
            lastCommit: commit?.commit?.author?.date,
            lastCommitSha: commit?.sha
        };
    });
    
    return Promise.all(requests);
}

// Определяем emoji-статус по дате последнего коммита
function getBranchEmoji(lastCommitDate) {
    if (!lastCommitDate) return '🔴';
    
    const daysDiff = (Date.now() - new Date(lastCommitDate)) / (1000 * 60 * 60 * 24);
    
    if (daysDiff < 7) return '🟢';  // Активная (менее недели)
    if (daysDiff < 30) return '🟡'; // Средняя активность
    return '🔴';                   // Неактивная
}

// Форматирование даты
function formatDate(dateString) {
    if (!dateString) return 'неизвестно';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Обработка ошибок
async function handleBranchError(ctx, error, repoName) {
    let errorMessage;
    
    if (error.response?.status === 404) {
        errorMessage = `❌ Репозиторий \`${repoName}\` не найден`;
    } else if (error.message.includes('API rate limit')) {
        errorMessage = '⚠️ Лимит GitHub API исчерпан. Попробуйте позже';
    } else {
        errorMessage = '❌ Ошибка при получении данных';
    }

    await sendMessage(ctx, errorMessage, { 
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
    });
}