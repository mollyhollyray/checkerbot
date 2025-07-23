const axios = require('axios');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const { log, logError } = require('../utils/logger');
const config = require('../config');
const NodeCache = require('node-cache');

const PR_CACHE_TTL = 300;
const MAX_PR_PER_REQUEST = 15;
const prCache = new NodeCache({ stdTTL: PR_CACHE_TTL });

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').filter(arg => arg.trim());
    
    if (args.length < 2) {
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

    const [owner, repo] = args[1].split('/');
    if (!owner || !repo) {
        return sendMessage(
            ctx,
            '❌ Неверный формат. Используйте: `owner/repo`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const repoKey = `${owner}/${repo}`.toLowerCase();
    let state = 'open';
    let limit = 5;
    let label = null;
    let author = null;

    try {
        await ctx.replyWithChatAction('typing');

        // Парсинг аргументов
        args.slice(2).forEach(arg => {
            if (['open', 'closed', 'all'].includes(arg)) {
                state = arg;
            } else if (/^\d+$/.test(arg)) {
                limit = Math.min(parseInt(arg), MAX_PR_PER_REQUEST);
            } else if (arg.startsWith('label:')) {
                label = arg.substring(6).trim();
            } else if (arg.startsWith('author:')) {
                author = arg.substring(7).trim();
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

        if (!pullRequests?.length) {
            let message = `🔍 В *${escapeMarkdown(repoKey)}* нет PR`;
            if (state !== 'open') message += ` со статусом \`${state}\``;
            if (label) message += ` с меткой \`${escapeMarkdown(label)}\``;
            if (author) message += ` от автора \`${escapeMarkdown(author)}\``;
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
        logError(error, `PR Error: ${repoKey}`);
        const errorMsg = error.response?.status === 404
            ? `Репозиторий \`${repoKey}\` не найден`
            : error.response?.status === 403
                ? 'Лимит GitHub API исчерпан'
                : `Ошибка: ${error.response?.data?.message || error.message}`;

        await sendMessage(ctx, `❌ ${errorMsg}`, { parse_mode: 'MarkdownV2' });
    }
};