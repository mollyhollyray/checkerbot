const { fetchRepoData } = require('../service/github');
const storage = require('../service/storage');
const { sendMessage } = require('../utils/message');
const { log, logError } = require('../utils/logger');

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const repoInput = args[0];

    // Валидация ввода
    if (!repoInput || !repoInput.includes('/')) {
        return sendMessage(ctx, 
            '❌ *Некорректный формат*\n' +
            'Используйте: `/add владелец/репозиторий`\n' +
            'Пример: `/add facebook/react`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const [owner, repo] = repoInput.split('/');
    const repoKey = `${owner}/${repo}`.toLowerCase();

    try {
        // Проверка на дубликаты
        if (storage.repos.has(repoKey)) {
            return sendMessage(ctx,
                `⚠️ Репозиторий \`${repoKey}\` уже отслеживается!\n` +
                'Используйте `/list` для просмотра всех репозиториев',
                { parse_mode: 'MarkdownV2' }
            );
        }

        // Получение данных с GitHub
        const repoData = await fetchRepoData(owner, repo);
        
        // Сохранение в хранилище
        storage.addRepo(owner, repo, {
            lastCommitSha: repoData.lastCommitSha,
            lastCommitTime: repoData.lastCommitTime,
            defaultBranch: repoData.defaultBranch,
            addedAt: new Date().toISOString()
        });

        // Успешный ответ
        await sendMessage(ctx,
            `✅ *Репоизторий добавлен*\n\n` +
            `▫️ *Имя:* \`${repoKey}\`\n` +
            `▫️ *Ветка по умолчанию:* \`${repoData.defaultBranch}\`\n` +
            `▫️ *Последний коммит:* \`${repoData.lastCommitSha.slice(0, 7)}\`\n` +
            `▫️ *Дата добавления:* ${new Date().toLocaleString('ru-RU')}`,
            { parse_mode: 'MarkdownV2' }
        );

        log(`Добавлен репозиторий: ${repoKey}`, 'success');

    } catch (error) {
        // Обработка специфичных ошибок GitHub
        let errorMessage;
        if (error.response?.status === 404) {
            errorMessage = `❌ Репозиторий \`${repoKey}\` не найден`;
        } else if (error.message.includes('API rate limit')) {
            errorMessage = '⚠️ Достигнут лимит запросов к GitHub API. Попробуйте позже';
        } else {
            errorMessage = `❌ Ошибка: ${error.message}`;
        }

        await sendMessage(ctx, errorMessage, { parse_mode: 'MarkdownV2' });
        logError(error, `Ошибка добавления репозитория: ${repoKey}`);
    }
};