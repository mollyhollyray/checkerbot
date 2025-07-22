const axios = require('axios');
const { sendMessage, sendLongMessage, escapeMarkdown } = require('../utils/message');
const { log, logError } = require('../utils/logger');
const config = require('../config');
const NodeCache = require('node-cache');

// Константы
const PR_CACHE_TTL = 300; // 5 минут в секундах
const MAX_PR_PER_REQUEST = 15; // Максимальное количество PR для запроса
const MAX_MESSAGE_LENGTH = 4096 - 500; // Лимит Telegram с запасом

// Инициализация кэша
const prCache = new NodeCache({ stdTTL: PR_CACHE_TTL });

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').filter(arg => arg.trim());
    
    // Проверка формата команды
    if (args.length < 2) {
        return sendMessage(
            ctx,
            '❌ *Формат команды*\n\n' +
            '▸ Используйте: `/pr владелец/репозиторий [состояние=open] [лимит=5] [label:метка]`\n' +
            '▸ *Состояния:* `open` (по умолчанию), `closed`, `all`\n' +
            '▸ *Лимит:* максимум 15 PR\n' +
            '▸ *Примеры:*\n' +
            '   `/pr facebook/react`\n' +
            '   `/pr vuejs/core closed 10`\n' +
            '   `/pr axios/axios all 5 label:bug`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const [owner, repo] = args[1].split('/');
    if (!owner || !repo) {
        return sendMessage(
            ctx,
            '❌ Неверный формат. Используйте: `владелец/репозиторий`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const repoKey = `${owner}/${repo}`.toLowerCase();
    let state = 'open';
    let limit = 5;
    let label = null;

    // Парсинг аргументов
    args.slice(2).forEach(arg => {
        if (['open', 'closed', 'all'].includes(arg)) state = arg;
        else if (/^\d+$/.test(arg)) limit = Math.min(parseInt(arg), MAX_PR_PER_REQUEST);
        else if (arg.startsWith('label:')) label = arg.substring(6).trim();
    });

    try {
        const cacheKey = `${repoKey}-${state}-${label || 'no-label'}`;
        let pullRequests = prCache.get(cacheKey);

        if (!pullRequests) {
            const params = {
                state,
                per_page: limit,
                sort: 'updated',
                direction: 'desc',
                ...(label && { labels: label })
            };

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
            const message = label
                ? `🔍 В *${escapeMarkdown(repoKey)}* нет PR (${state}, метка \`${escapeMarkdown(label)}\`)`
                : `🔍 В *${escapeMarkdown(repoKey)}* нет PR со статусом \`${state}\``;
            return sendMessage(ctx, message, { parse_mode: 'MarkdownV2' });
        }

        // Формирование сообщения с разбивкой
        let header = `📌 *Pull Requests в ${escapeMarkdown(repoKey)}*\n` +
                    `┣ *Фильтры:* \`${state}\`${label ? ` + \`${escapeMarkdown(label)}\`` : ''}\n` +
                    `┗ *Найдено:* ${pullRequests.length}\n\n`;

        await sendMessage(ctx, header, { parse_mode: 'MarkdownV2' });

        // Отправка каждого PR отдельным сообщением
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