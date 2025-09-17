const axios = require('axios');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');
const storage = require('../service/storage');
const NodeCache = require('node-cache');

const PR_CACHE_TTL = 300;
const MAX_PR_PER_REQUEST = 15;
const prCache = new NodeCache({ stdTTL: PR_CACHE_TTL });

function isValidRepoFormat(repoInput) {
    return repoInput && 
           repoInput.includes('/') && 
           repoInput.split('/').length === 2;
}

function sanitizeRepoInput(repoInput) {
    return repoInput.replace(/[^a-zA-Z0-9_\-\.\/]/g, '').toLowerCase();
}

function validateState(state) {
    const validStates = ['open', 'closed', 'all'];
    return validStates.includes(state) ? state : 'open';
}

function validateLimit(limit) {
    const num = parseInt(limit);
    return !isNaN(num) && num > 0 && num <= MAX_PR_PER_REQUEST ? num : 5;
}

function sanitizeFilterValue(value) {
    return value.replace(/[^a-zA-Z0-9_\-\.\s]/g, '');
}

module.exports = async (ctx) => {
    try {
        // Получаем текст команды из message или callback
        let args;
        if (ctx.message && ctx.message.text) {
            args = ctx.message.text.split(' ').filter(arg => arg.trim());
        } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
            args = ctx.callbackQuery.data.split(' ').filter(arg => arg.trim());
        } else {
            return sendMessage(
                ctx,
                '❌ *Неверный формат команды*',
                { parse_mode: 'MarkdownV2' }
            );
        }
        
        if (args.length < 2 || !isValidRepoFormat(args[1])) {
            return sendMessage(
                ctx,
                '❌ *Формат команды*\n\n' +
                '▸ Используйте: `/pr owner/repo [state=open] [limit=5] [label:tag] [author:name]`\n' +
                '▸ *Состояния:* `open` (по умолчанию), `closed`, `all`\n' +
                '▸ *Лимит:* максимум 15 PR\n' +
                '▸ *Примеры:*\n' +
                '   `/pr facebook/react`\n' +
                '   `/pr vuejs/core closed 10`\n' +
                '   `/pr axios/axios all 5 label:bug author:john`',
                { parse_mode: 'MarkdownV2' }
            );
        }

        const sanitizedInput = sanitizeRepoInput(args[1]);
        const [owner, repo] = sanitizedInput.split('/');
        const repoKey = `${owner}/${repo}`.toLowerCase();

        if (owner.length > 50 || repo.length > 100) {
            return sendMessage(
                ctx,
                '❌ Слишком длинное имя владельца или репозитория',
                { parse_mode: 'MarkdownV2' }
            );
        }

        await ctx.replyWithChatAction('typing');

        let state = 'open';
        let limit = 5;
        let label = null;
        let author = null;

        // Парсим аргументы с валидацией
        args.slice(2).forEach(arg => {
            if (['open', 'closed', 'all'].includes(arg)) {
                state = validateState(arg);
            } else if (/^\d+$/.test(arg)) {
                limit = validateLimit(arg);
            } else if (arg.startsWith('label:')) {
                label = sanitizeFilterValue(arg.substring(6).trim());
                if (label.length > 50) label = label.substring(0, 50);
            } else if (arg.startsWith('author:')) {
                author = sanitizeFilterValue(arg.substring(7).trim());
                if (author.length > 39) author = author.substring(0, 39);
            }
        });

        const cacheKey = `${repoKey}-${state}-${label || 'no-label'}-${author || 'no-author'}`;
        let pullRequests = prCache.get(cacheKey);

        if (!pullRequests) {
            const params = {
                state,
                per_page: limit,
                sort: 'updated',
                direction: 'desc'
            };
            if (label) params.labels = label;
            if (author) params.creator = author;

            const response = await axios.get(
                `https://api.github.com/repos/${owner}/${repo}/pulls`,
                {
                    params,
                    headers: {
                        'Authorization': `token ${config.GITHUB_TOKEN}`,
                        'User-Agent': 'GitHub-Tracker-Bot'
                    }
                }
            );
            pullRequests = response.data;
            prCache.set(cacheKey, pullRequests);
        }

        // Проверяем есть ли PR
        if (!pullRequests || pullRequests.length === 0) {
            let message = `🔍 *В ${escapeMarkdown(repoKey)} нет PR*`;
            
            if (state !== 'open') {
                message += ` со статусом \`${state}\``;
            }
            if (label) {
                message += ` с меткой \`${escapeMarkdown(label)}\``;
            }
            if (author) {
                message += ` от автора \`${escapeMarkdown(author)}\``;
            }
            
            message += '\n\n💡 *Попробуйте:*\n';
            message += `• Изменить статус: \`/pr ${repoKey} all\`\n`;
            message += `• Убрать фильтры: \`/pr ${repoKey}\`\n`;
            message += `• Проверить другой репозиторий`;
            
            return sendMessage(ctx, message, { parse_mode: 'MarkdownV2' });
        }

        let header = `📌 *Pull Requests в ${escapeMarkdown(repoKey)}*\n` +
                    `┣ *Фильтры:* \`${state}\`` +
                    (label ? ` + \`${escapeMarkdown(label)}\`` : '') +
                    (author ? ` + автор:\`${escapeMarkdown(author)}\`` : '') + '\n' +
                    `┗ *Найдено:* ${pullRequests.length}\n\n`;

        await sendMessage(ctx, header, { parse_mode: 'MarkdownV2' });

        for (const pr of pullRequests) {
            const emoji = pr.state === 'open' ? '🟢' : pr.merged ? '🟣' : '🔴';
            const status = pr.state === 'open' ? 'Open' : pr.merged ? 'Merged' : 'Closed';
            const labels = pr.labels.map(l => `\`${escapeMarkdown(l.name)}\``).join(', ');

            const prMessage = `${emoji} *PR #${pr.number}: ${escapeMarkdown(pr.title)}*\n` +
                             `┣ *Автор:* [${escapeMarkdown(pr.user.login)}](${pr.user.html_url})\n` +
                             `┣ *Состояние:* ${status}\n` +
                             `┣ *Обновлён:* ${new Date(pr.updated_at).toLocaleString('ru-RU')}\n` +
                             `${labels ? `┣ *Метки:* ${labels}\n` : ''}` +
                             `┗ [Ссылка](${pr.html_url})`;

            await sendMessage(ctx, prMessage, { 
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: true
            });
        }

    } catch (error) {
        logger.error(`PR Error: ${error.message}`);
        
        let errorMsg;
        if (error.response?.status === 404) {
            errorMsg = 'Репозиторий не найден';
        } else if (error.response?.status === 403) {
            errorMsg = 'Лимит GitHub API исчерпан';
        } else if (error.response?.status === 409) {
            errorMsg = 'Репозиторий пуст или не содержит PR';
        } else {
            errorMsg = error.response?.data?.message || error.message || 'Неизвестная ошибка';
        }

        await sendMessage(
            ctx,
            `❌ *Ошибка:* ${escapeMarkdown(errorMsg)}`,
            { parse_mode: 'MarkdownV2' }
        );
    }
};