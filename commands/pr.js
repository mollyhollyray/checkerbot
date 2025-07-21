const axios = require('axios');
const { sendMessage, sendLongMessage, escapeMarkdown } = require('../utils/message');
const { log, logError } = require('../utils/logger');
const config = require('../config');
const NodeCache = require('node-cache');

// Инициализация кэша с TTL из конфига (по умолчанию 5 минут)
const prCache = new NodeCache({ stdTTL: 300 });

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').filter(arg => arg.trim());
    
    // Проверка формата команды
    if (args.length < 2) {
        return sendMessage(
            ctx,
            '❌ *Формат команды*\n\n' +
            '▸ Используйте: `/pr владелец/репозиторий [состояние=open] [лимит=5] [label:метка]`\n' +
            '▸ *Состояния:* `open` (по умолчанию), `closed`, `all`\n' +
            '▸ *Лимит:* максимум 15 PR (по умолчанию 5)\n' +
            '▸ *Примеры:*\n' +
            '   `/pr facebook/react`\n' +
            '   `/pr vuejs/core closed 10`\n' +
            '   `/pr axios/axios all 5 label:bug`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const [owner, repo] = args[1].includes('/') 
        ? args[1].split('/') 
        : [args[1], '']; // Защита от неправильного формата

    if (!owner || !repo) {
        return sendMessage(
            ctx,
            '❌ Неверный формат репозитория. Используйте: `владелец/репозиторий`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const repoKey = `${owner}/${repo}`.toLowerCase();
    let state = 'open';
    let limit = 5;
    let label = null;

    // Парсинг аргументов
    args.slice(2).forEach(arg => {
        if (['open', 'closed', 'all'].includes(arg)) {
            state = arg;
        } else if (/^\d+$/.test(arg)) {
            limit = Math.min(parseInt(arg), 15);
        } else if (arg.startsWith('label:')) {
            label = arg.substring(6).trim();
        }
    });

    try {
        // Проверка кэша
        const cacheKey = `${repoKey}-${state}-${label || 'no-label'}`;
        const cachedPRs = prCache.get(cacheKey);
        
        let pullRequests = cachedPRs;
        if (!cachedPRs) {
            log(`Запрос PR для ${cacheKey}`, 'info');
            
            const params = {
                state,
                per_page: limit,
                sort: 'updated',
                direction: 'desc'
            };
            if (label) params.labels = label;

            const response = await axios.get(
                `https://api.github.com/repos/${owner}/${repo}/pulls`,
                {
                    params,
                    headers: {
                        'Authorization': `token ${config.GITHUB_TOKEN}`,
                        'User-Agent': 'GitHub-Tracker-Bot',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            pullRequests = response.data;
            prCache.set(cacheKey, pullRequests);
        }

        // Обработка пустого результата
        if (!pullRequests?.length) {
            const message = label
                ? `🔍 В *${escapeMarkdown(repoKey)}* нет PR (${state}, метка \`${escapeMarkdown(label)}\`)`
                : `🔍 В *${escapeMarkdown(repoKey)}* нет PR со статусом \`${state}\``;
            
            return sendMessage(ctx, message, { parse_mode: 'MarkdownV2' });
        }

        // Формирование сообщения
        let message = `📌 *Pull Requests в ${escapeMarkdown(repoKey)}*\n` +
                     `┣ *Фильтры:* \`${state}\`${label ? ` + \`${escapeMarkdown(label)}\`` : ''}\n` +
                     `┗ *Найдено:* ${pullRequests.length}\n\n`;

        pullRequests.forEach(pr => {
            const emoji = pr.state === 'open' ? '🟢' : pr.merged ? '🟣' : '🔴';
            const status = pr.state === 'open' ? 'Open' : pr.merged ? 'Merged' : 'Closed';
            const labels = pr.labels.map(l => `\`${escapeMarkdown(l.name)}\``).join(', ');
            
            message += `${emoji} *PR #${pr.number}: ${escapeMarkdown(pr.title)}*\n` +
                       `┣ *Автор:* [${escapeMarkdown(pr.user.login)}](${pr.user.html_url})\n` +
                       `┣ *Состояние:* ${status}\n` +
                       `┣ *Обновлён:* ${new Date(pr.updated_at).toLocaleString('ru-RU')}\n` +
                       `${labels ? `┣ *Метки:* ${labels}\n` : ''}` +
                       `┗ [Ссылка](${pr.html_url})\n\n`;
        });

        message += `ℹ️ Для деталей: \`/prview ${escapeMarkdown(repoKey)} <номер PR>\``;

        await sendLongMessage(ctx, message, { parse_mode: 'MarkdownV2' });

    } catch (error) {
        logError(error, `PR Error: ${repoKey}`);
        
        let errorMsg = '❌ Ошибка: ';
        if (error.response?.status === 404) {
            errorMsg += `Репозиторий \`${repoKey}\` не найден`;
        } else if (error.response?.status === 403) {
            errorMsg += 'Лимит GitHub API исчерпан';
        } else {
            errorMsg += error.response?.data?.message || error.message;
        }

        await sendMessage(ctx, errorMsg, { parse_mode: 'MarkdownV2' });
    }
};