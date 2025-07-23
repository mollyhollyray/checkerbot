const { fetchRepoData, isRepoAccessible } = require('../service/github');
const storage = require('../service/storage');
const { log, logError } = require('../utils/logger');
const { sendMessage, escapeHtml } = require('../utils/message');

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);
        const repoInput = args[0];

        if (!repoInput || !repoInput.includes('/')) {
            return await sendMessage(
                ctx,
                '<b>❌ Неверный формат команды</b>\n\n' +
                '<i>Используйте:</i> <code>/add владелец/репозиторий</code>\n' +
                '<i>Пример:</i> <code>/add facebook/react</code>',
                { parse_mode: 'HTML' }
            );
        }

        const [owner, repo] = repoInput.split('/');
        const repoKey = `${owner}/${repo}`.toLowerCase();

        if (storage.repos.has(repoKey)) {
            return await sendMessage(
                ctx,
                `<b>❌ Репозиторий <code>${escapeHtml(repoKey)}</code> уже отслеживается!</b>\n\n` +
                'Используйте <code>/list</code> для просмотра всех репозиториев',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');

        // Проверка доступности репозитория
        const isAccessible = await isRepoAccessible(owner, repo);
        if (!isAccessible) {
            return await sendMessage(
                ctx,
                `❌ Репозиторий не доступен. Проверьте:\n1. Существование\n2. Публичный доступ\n3. Ваши права`,
                { parse_mode: 'HTML' }
            );
        }

        const repoData = await fetchRepoData(owner, repo);
        const success = storage.addRepo(owner, repo, {
            lastCommitSha: repoData.lastCommitSha,
            lastCommitTime: repoData.lastCommitTime,
            defaultBranch: repoData.defaultBranch
        });

        if (!success) throw new Error('Не удалось сохранить репозиторий');

        const replyText = [
            '<b>✅ Репозиторий успешно добавлен</b>',
            '',
            `<b>▸ Имя:</b> <code>${escapeHtml(repoKey)}</code>`,
            `<b>▸ Ветка по умолчанию:</b> <code>${escapeHtml(repoData.defaultBranch)}</code>`,
            `<b>▸ Последний коммит:</b> <code>${escapeHtml(repoData.lastCommitSha?.slice(0, 7) || 'unknown')}</code>`,
            '',
            `<i>Автоматическая проверка каждые ${config.CHECK_INTERVAL_MINUTES} минут</i>`
        ].join('\n');

        await sendMessage(ctx, replyText, { parse_mode: 'HTML' });
        log(`Добавлен репозиторий: ${repoKey}`);

    } catch (error) {
        logError(error, 'Ошибка в команде /add');
        
        let errorMessage;
        if (error.response?.status === 404) {
            errorMessage = '<b>❌ Репозиторий не найден</b>\nПроверьте правильность написания владельца и названия';
        } else if (error.message.includes('API rate limit')) {
            errorMessage = '<b>⚠️ Достигнут лимит запросов к GitHub</b>\nПопробуйте через 1 час';
        } else {
            errorMessage = '<b>❌ Ошибка при добавлении репозитория</b>\n' + 
                          `<code>${escapeHtml(error.message)}</code>`;
        }

        await sendMessage(ctx, errorMessage, { parse_mode: 'HTML' });
    }
};