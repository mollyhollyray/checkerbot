const { fetchAllReleases, fetchLatestRelease } = require('../service/github');
const { sendMessage, sendLongMessage, escapeHtml } = require('../utils/message');
const logger = require('../utils/logger');
const storage = require('../service/storage');

function isValidRepoFormat(repoInput) {
    return repoInput && repoInput.includes('/') && repoInput.split('/').length === 2;
}

function sanitizeRepoInput(repoInput) {
    return repoInput.replace(/[^a-zA-Z0-9_\-\.\/]/g, '').toLowerCase();
}

module.exports = async (ctx) => {
    try {
        let args;
        if (ctx.message && ctx.message.text) {
            args = ctx.message.text.split(' ').filter(arg => arg.trim());
        } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
            args = ctx.callbackQuery.data.split(' ').filter(arg => arg.trim());
        } else {
            return await sendMessage(ctx, '❌ Неверный формат команды', { parse_mode: 'HTML' });
        }

        if (args.length < 2 || !isValidRepoFormat(args[1])) {
            return await sendMessage(
                ctx,
                '<b>❌ Неверный формат команды</b>\n\n' +
                '<i>Использование:</i> <code>/releases owner/repo [limit=10]</code>\n\n' +
                '<i>Примеры:</i>\n' +
                '<code>/releases facebook/react</code>\n' +
                '<code>/releases vuejs/core 5</code>',
                { parse_mode: 'HTML' }
            );
        }

        const sanitizedInput = sanitizeRepoInput(args[1]);
        const [owner, repo] = sanitizedInput.split('/');
        const repoKey = `${owner}/${repo}`;
        
        let limit = 10;
        if (args.length >= 3 && !isNaN(args[2])) {
            limit = Math.min(parseInt(args[2]), 20);
        }

        await ctx.replyWithChatAction('typing');

        const releases = await fetchAllReleases(owner, repo, limit);
        
        if (!releases || releases.length === 0) {
            // Проверяем есть ли теги
            const latestRelease = await fetchLatestRelease(owner, repo);
            if (!latestRelease) {
                return await sendMessage(
                    ctx,
                    `📭 <b>В ${escapeHtml(repoKey)} нет релизов</b>\n\n` +
                    `Репозиторий не имеет опубликованных релизов или тегов.`,
                    { parse_mode: 'HTML' }
                );
            }
            
            releases = [latestRelease];
        }

        const releaseInfo = storage.getRepoReleaseInfo(owner, repo);
        const latestRelease = releases[0];

        let message = `📦 <b>Релизы ${escapeHtml(repoKey)}</b>\n\n`;
        
        if (releaseInfo && releaseInfo.lastReleaseTag) {
            message += `🎯 <b>Последний отслеживаемый релиз:</b> <code>${escapeHtml(releaseInfo.lastReleaseTag)}</code>\n`;
        }
        
        message += `📊 <b>Всего релизов:</b> ${releases.length}\n`;
        message += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n\n';

        releases.forEach((release, index) => {
            const isLatest = index === 0;
            const date = new Date(release.published_at || release.created_at);
            
            message += `${isLatest ? '🌟' : '📌'} <b>${escapeHtml(release.name || release.tag_name)}</b>\n`;
            message += `🏷️ <b>Тег:</b> <code>${escapeHtml(release.tag_name)}</code>\n`;
            message += `📅 <b>Дата:</b> ${date.toLocaleString('ru-RU')}\n`;
            message += `📝 <b>Описание:</b> ${release.body ? escapeHtml(release.body.substring(0, 100)) + '...' : 'нет'}\n`;
            message += `🔗 <a href="${release.html_url}">Ссылка на релиз</a>\n\n`;
        });

        message += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n';
        message += `💡 <i>Автоматическое отслеживание релизов включено</i>`;

        await sendLongMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    } catch (error) {
        logger.error(error, 'Releases command failed');
        await sendMessage(
            ctx,
            `❌ Ошибка: ${escapeHtml(error.message || 'Неизвестная ошибка')}`,
            { parse_mode: 'HTML' }
        );
    }
};