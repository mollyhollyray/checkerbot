const { fetchRepoData, isRepoAccessible } = require('../service/github');
const config = require('../config');
const storage = require('../service/storage');
const { log, logError } = require('../utils/logger');
const { sendMessage, escapeHtml } = require('../utils/message');
const config = require('../config');

function isValidRepoFormat(repoInput) {
    return repoInput && 
           repoInput.includes('/') && 
           repoInput.split('/').length === 2 &&
           repoInput.split('/')[0].length > 0 &&
           repoInput.split('/')[1].length > 0;
}

function sanitizeRepoInput(repoInput) {
    return repoInput.replace(/[^a-zA-Z0-9_\-\.\/]/g, '').toLowerCase();
}

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);
        const repoInput = args[0];

        if (ctx.from.id !== config.ADMIN_USER_ID) {
                    return await sendMessage(
                        ctx,
                        '❌ Эта команда доступна только администратору',
                        { parse_mode: 'HTML' }
                    );
                }

        if (!repoInput || !isValidRepoFormat(repoInput)) {
            return await sendMessage(
                ctx,
                '<b>❌ Неверный формат репозитория</b>\n\n' +
                '<i>Используйте:</i> <code>/add владелец/репозиторий</code>\n' +
                '<i>Пример:</i> <code>/add facebook/react</code>\n\n' +
                '<b>Разрешены только:</b> буквы, цифры, дефисы и подчеркивания',
                { parse_mode: 'HTML' }
            );
        }

        const sanitizedInput = sanitizeRepoInput(repoInput);
        const [owner, repo] = sanitizedInput.split('/');

        if (owner.length > 50 || repo.length > 100) {
            return await sendMessage(
                ctx,
                '<b>❌ Слишком длинное имя владельца или репозитория</b>\n\n' +
                'Максимум: 50 символов для владельца, 100 для репозитория',
                { parse_mode: 'HTML' }
            );
        }

        const repoKey = `${owner}/${repo}`.toLowerCase();

        if (storage.repos.has(repoKey)) {
            return await sendMessage(
                ctx,
                `<b>❌ Репозиторий <code>${escapeHtml(repoKey)}</code> уже отслеживается!</b>\n\n` +
                'Используйте <code>/list</code> для просмотра всех репозиториев',
                { parse_mode: 'HTML' }
            );
        }

        if (storage.getRepos().length >= config.MAX_REPOS) {
            return await sendMessage(
                ctx,
                `<b>❌ Достигнут лимит репозиториев (${config.MAX_REPOS})</b>\n\n` +
                'Удалите некоторые репозитории командой /remove',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');

        const isAccessible = await isRepoAccessible(owner, repo);
        if (!isAccessible) {
            return await sendMessage(
                ctx,
                `<b>❌ Репозиторий <code>${escapeHtml(repoKey)}</code> не доступен</b>\n\n` +
                'Проверьте:\n1. Существование репозитория\n2. Публичный доступ\n3. Ваши права доступа',
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
        log(`Добавлен репозиторий: ${repoKey}`, 'info', { owner, repo });

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