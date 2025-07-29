const { getDefaultBranch, fetchCommitsWithNumbers, checkBranchExists } = require('../service/github');
const { sendMessage, escapeHtml } = require('../utils/message');
const logger = require('../utils/logger');

module.exports = async (ctx) => {
    try {
        const inputText = ctx.message?.text || ctx.callbackQuery?.data;
        if (!inputText) {
            return await sendMessage(ctx, '❌ Неверный формат команды', { 
                parse_mode: 'HTML' 
            });
        }

        const args = inputText.split(' ').filter(arg => arg.trim());
        if (args.length < 2 || !args[1].includes('/')) {
            return sendMessage(ctx,
                '<b>❌ Неверный формат команды</b>\n\n' +
                '▸ Используйте: <code>/last owner/repo [ветка] [количество=5]</code>',
                { parse_mode: 'HTML' }
            );
        }

        const [owner, repo] = args[1].split('/');
        const repoKey = `${owner}/${repo}`;
        let branch, count = 5, page = 1;

        await ctx.replyWithChatAction('typing');

        if (args.length >= 3) {
            if (!isNaN(parseInt(args[2]))) {
                count = Math.min(parseInt(args[2]), 20);
                branch = args.length >= 4 ? args[3] : await getDefaultBranch(owner, repo) || 'main';
            } else {
                branch = args[2];
                if (args.length >= 4) count = Math.min(parseInt(args[3]), 20);
            }
        } else {
            branch = await getDefaultBranch(owner, repo) || 'main';
        }

        if (!await checkBranchExists(owner, repo, branch)) {
            return sendMessage(ctx,
                `❌ Ветка <b>${escapeHtml(branch)}</b> не найдена`,
                { parse_mode: 'HTML' }
            );
        }

        const { commits, firstNumber, hasMore } = await fetchCommitsWithNumbers(owner, repo, branch, count, page);
        
        if (!commits.length) {
            return sendMessage(ctx,
                `🔍 В ветке <b>${escapeHtml(branch)}</b> нет коммитов`,
                { parse_mode: 'HTML' }
            );
        }

        let message = `📌 <b>Коммиты в ${escapeHtml(repoKey)} (${escapeHtml(branch)})</b>\n\n`;

        commits.forEach((commit, index) => {
            const date = new Date(commit.commit.author.date);
            date.setHours(date.getHours() + 3);
            
            message += 
`🔹 <b>#${firstNumber + index}</b> <code>${commit.sha.substring(0, 7)}</code>
├ 🕒 ${date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
├ 👤 ${escapeHtml(commit.commit.author.name)}
├ 📝 ${escapeHtml(commit.commit.message.split('\n')[0].slice(0, 70))}
└ 🔗 <a href="${commit.html_url}">Подробнее</a>\n\n`;
        });

        message += `📊 Показано коммитов: ${commits.length}\n`;
        if (hasMore) {
            message += `🔍 Для следующих: <code>/last ${escapeHtml(repoKey)} ${escapeHtml(branch)} ${count} ${page+1}</code>`;
        }

        await sendMessage(ctx, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true 
        });

    } catch (error) {
        logger.error(error, 'Last command failed');
        await sendMessage(ctx,
            `❌ Ошибка: ${escapeHtml(error.message || 'Неизвестная ошибка')}`,
            { parse_mode: 'HTML' }
        );
    }
};