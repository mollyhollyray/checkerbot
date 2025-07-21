const { fetchRepoBranches, getBranchLastCommit, getDefaultBranch } = require('../service/github');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const { log, logError } = require('../utils/logger');

// Константы
const MAX_MESSAGE_LENGTH = 4000; // Лимит Telegram с запасом
const BRANCHES_PER_MESSAGE = 10; // Оптимальное количество веток в одном сообщении
const MESSAGE_DELAY_MS = 300;    // Задержка между сообщениями

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    
    // Валидация формата команды
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
        // Параллельное получение данных
        const [branches, defaultBranch] = await Promise.all([
            fetchRepoBranches(owner, repo),
            getDefaultBranch(owner, repo)
        ]);

        // Проверка наличия веток
        if (!branches?.length) {
            return sendMessage(
                ctx,
                `🌿 *${escapeMarkdown(repoName)}*\n\n` +
                'В репозитории не найдено веток',
                { parse_mode: 'MarkdownV2' }
            );
        }

        // Получение доп. информации о ветках
        const branchesWithStatus = await getBranchesStatus(owner, repo, branches);
        
        // Сортировка: сначала ветка по умолчанию, затем по дате коммита
        branchesWithStatus.sort((a, b) => {
            if (a.name === defaultBranch) return -1;
            if (b.name === defaultBranch) return 1;
            return new Date(b.lastCommit) - new Date(a.lastCommit);
        });

        // Формирование и отправка сообщений
        await sendBranchesMessages(ctx, {
            repoName,
            branches: branchesWithStatus,
            defaultBranch,
            totalCount: branches.length
        });

    } catch (error) {
        logError(error, `Branches command failed: ${repoName}`);
        await handleBranchError(ctx, error, repoName);
    }
};

/**
 * Формирует и отправляет сообщения с ветками
 */
async function sendBranchesMessages(ctx, { repoName, branches, defaultBranch, totalCount }) {
    // Отправка заголовка
    await sendMessage(
        ctx,
        `🌳 *Ветки репозитория ${escapeMarkdown(repoName)}* 🌳\n` +
        `📊 Всего веток: *${totalCount}*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`,
        { parse_mode: 'MarkdownV2' }
    );

    // Разбиваем ветки на группы
    const branchGroups = [];
    for (let i = 0; i < branches.length; i += BRANCHES_PER_MESSAGE) {
        branchGroups.push(branches.slice(i, i + BRANCHES_PER_MESSAGE));
    }

    // Отправка групп веток
    for (const [index, group] of branchGroups.entries()) {
        let message = branchGroups.length > 1 
            ? `*Часть ${index + 1}/${branchGroups.length}*\n\n` 
            : '';

        // Формируем блоки с информацией о ветках
        group.forEach(branch => {
            const isDefault = branch.name === defaultBranch;
            const statusEmoji = getBranchEmoji(branch.lastCommit);
            
            message += `${isDefault ? '👑' : '└'} *${escapeMarkdown(branch.name)}* ` +
                      `${isDefault ? '(по умолчанию)' : ''}\n` +
                      `   ${statusEmoji} Последний коммит: ${formatDate(branch.lastCommit)}\n` +
                      `   🆔 ${branch.lastCommitSha?.slice(0, 7) || 'unknown'}\n\n`;
        });

        await sendMessage(ctx, message, {
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true
        });

        // Задержка между сообщениями
        if (branchGroups.length > 1 && index < branchGroups.length - 1) {
            await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
        }
    }

    // Отправка подвала
    await sendMessage(
        ctx,
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `Для просмотра коммитов: \`/last ${escapeMarkdown(repoName)} [ветка]\``,
        { parse_mode: 'MarkdownV2' }
    );
}

/**
 * Получает статус для всех веток
 */
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

/**
 * Определяет emoji-статус по дате последнего коммита
 */
function getBranchEmoji(lastCommitDate) {
    if (!lastCommitDate) return '🔴';
    
    const daysDiff = (Date.now() - new Date(lastCommitDate)) / (1000 * 60 * 60 * 24);
    
    if (daysDiff < 7) return '🟢';  // Активная (менее недели)
    if (daysDiff < 30) return '🟡'; // Средняя активность
    return '🔴';                   // Неактивная
}

/**
 * Форматирует дату
 */
function formatDate(dateString) {
    if (!dateString) return 'неизвестно';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Обрабатывает ошибки
 */
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