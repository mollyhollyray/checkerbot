const axios = require('axios');
const { sendMessage, escapeHtml } = require('../utils/message');
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

function formatDate(dateString) {
    if (!dateString) return 'неизвестно';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusEmoji(state, merged) {
    if (state === 'open') return '🟢';
    if (merged) return '🟣';
    return '🔴';
}

function getStatusText(state, merged) {
    if (state === 'open') return 'Open';
    if (merged) return 'Merged';
    return 'Closed';
}

module.exports = async (ctx) => {
    try {
        let args;
        if (ctx.message && ctx.message.text) {
            args = ctx.message.text.split(' ').filter(arg => arg.trim());
        } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
            args = ctx.callbackQuery.data.split(' ').filter(arg => arg.trim());
        } else {
            return sendMessage(
                ctx,
                '❌ <b>Неверный формат команды</b>',
                { parse_mode: 'HTML' }
            );
        }
        
        if (args.length < 2 || !isValidRepoFormat(args[1])) {
            return sendMessage(
                ctx,
                '<b>❌ Формат команды</b>\n\n' +
                '▸ Используйте: <code>/pr owner/repo [state=open] [limit=5] [label:tag] [author:name]</code>\n' +
                '▸ <b>Состояния:</b> <code>open</code> (по умолчанию), <code>closed</code>, <code>all</code>\n' +
                '▸ <b>Лимит:</b> максимум 15 PR\n' +
                '▸ <b>Примеры:</b>\n' +
                '   <code>/pr facebook/react</code>\n' +
                '   <code>/pr vuejs/core closed 10</code>\n' +
                '   <code>/pr axios/axios all 5 label:bug author:john</code>',
                { parse_mode: 'HTML' }
            );
        }

        const sanitizedInput = sanitizeRepoInput(args[1]);
        const [owner, repo] = sanitizedInput.split('/');
        const repoKey = `${owner}/${repo}`.toLowerCase();

        if (owner.length > 50 || repo.length > 100) {
            return sendMessage(
                ctx,
                '❌ <b>Слишком длинное имя владельца или репозитория</b>',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');

        let state = 'open';
        let limit = 5;
        let label = null;
        let author = null;

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

        if (!pullRequests || pullRequests.length === 0) {
            let message = `🔍 <b>В ${escapeHtml(repoKey)} нет PR</b>`;
            
            if (state !== 'open') {
                message += ` со статусом <code>${state}</code>`;
            }
            if (label) {
                message += ` с меткой <code>${escapeHtml(label)}</code>`;
            }
            if (author) {
                message += ` от автора <code>${escapeHtml(author)}</code>`;
            }
            
            message += '\n\n💡 <b>Попробуйте:</b>\n';
            message += `• Изменить статус: <code>/pr ${repoKey} all</code>\n`;
            message += `• Убрать фильтры: <code>/pr ${repoKey}</code>\n`;
            message += `• Проверить другой репозиторий`;
            
            return sendMessage(ctx, message, { parse_mode: 'HTML' });
        }

        let message = `📌 <b>Pull Requests в ${escapeHtml(repoKey)}</b>\n`;
        message += `┣ <b>Фильтры:</b> <code>${state}</code>`;
        if (label) message += ` + <code>${escapeHtml(label)}</code>`;
        if (author) message += ` + автор:<code>${escapeHtml(author)}</code>`;
        message += `\n┗ <b>Найдено:</b> ${pullRequests.length}\n\n`;
        message += '━━━━━━━━━━━━━━━━━━\n\n';

        pullRequests.forEach((pr, index) => {
            const emoji = getStatusEmoji(pr.state, pr.merged);
            const status = getStatusText(pr.state, pr.merged);
            const labels = pr.labels.map(l => `<code>${escapeHtml(l.name)}</code>`).join(', ');
            const updatedAt = formatDate(pr.updated_at);

            message += `${emoji} <b>PR #${pr.number}: ${escapeHtml(pr.title)}</b>\n`;
            message += `┣ <b>Автор:</b> <a href="${pr.user.html_url}">@${escapeHtml(pr.user.login)}</a>\n`;
            message += `┣ <b>Состояние:</b> ${status}\n`;
            message += `┣ <b>Обновлён:</b> ${updatedAt}\n`;
            if (labels) {
                message += `┣ <b>Метки:</b> ${labels}\n`;
            }
            message += `┗ <a href="${pr.html_url}">🔗 Ссылка на PR</a>\n\n`;

            if (index < pullRequests.length - 1) {
                message += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n\n';
            }
        });

        message += '━━━━━━━━━━━━━━━━━━\n';
        message += `💡 <i>Для детального просмотра: <code>/prview ${repoKey} [номер]</code></i>`;

        await sendMessage(ctx, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

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
            `❌ <b>Ошибка:</b> ${escapeHtml(errorMsg)}`,
            { parse_mode: 'HTML' }
        );
    }
};