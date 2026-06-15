const { getDefaultBranch, fetchCommitsWithNumbers, checkBranchExists } = require('../service/github');
const { sendMessage, escapeHtml } = require('../utils/message');
const logger = require('../utils/logger');
const storage = require('../service/storage-mongo');
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

function validateCount(count) {
    const num = parseInt(count);
    return !isNaN(num) && num > 0 && num <= 20 ? num : 5;
}

function validatePage(page) {
    const num = parseInt(page);
    return !isNaN(num) && num > 0 && num <= 10 ? num : 1;
}

function sanitizeBranchName(branch) {
    return branch.replace(/[^a-zA-Z0-9_\-\.\/]/g, '');
}

module.exports = async (ctx) => {
    try {
        const inputText = ctx.message?.text || ctx.callbackQuery?.data;
        if (!inputText) {
            return await sendMessage(ctx, '❌ Неверный формат команды', { 
                parse_mode: 'HTML' 
            });
        }

                if (ctx.from.id !== config.ADMIN_USER_ID) {
                            return await sendMessage(
                                ctx,
                                '❌ Эта команда доступна только администратору',
                                { parse_mode: 'HTML' }
                            );
                        }

        const args = inputText.split(' ').filter(arg => arg.trim());
        if (args.length < 2 || !isValidRepoFormat(args[1])) {
            return sendMessage(ctx,
                '<b>❌ Неверный формат команды</b>\n\n' +
                '▸ Используйте: <code>/last owner/repo [ветка] [количество=5] [страница=1]</code>\n' +
                '▸ <b>Примеры:</b>\n' +
                '   <code>/last facebook/react</code>\n' +
                '   <code>/last vuejs/core next 10</code>\n' +
                '   <code>/last axios/axios main 5 2</code>',
                { parse_mode: 'HTML' }
            );
        }

        const sanitizedInput = sanitizeRepoInput(args[1]);
        const [owner, repo] = sanitizedInput.split('/');
        const repoKey = `${owner}/${repo}`;
        
        if (!storage.repoExists(owner, repo)) {
            return sendMessage(ctx,
                `<b>❌ Репозиторий <code>${escapeHtml(repoKey)}</code> не отслеживается</b>\n\n` +
                'Добавьте его командой /add',
                { parse_mode: 'HTML' }
            );
        }

        let branch, count = 5, page = 1;

        await ctx.replyWithChatAction('typing');

        if (args.length >= 3) {
            if (!isNaN(parseInt(args[2]))) {
                count = validateCount(args[2]);
                if (args.length >= 4) {
                    branch = sanitizeBranchName(args[3]);
                    if (args.length >= 5) {
                        page = validatePage(args[4]);
                    }
                } else {
                    branch = await getDefaultBranch(owner, repo) || 'main';
                }
            } else {
                branch = sanitizeBranchName(args[2]);
                if (args.length >= 4) {
                    count = validateCount(args[3]);
                    if (args.length >= 5) {
                        page = validatePage(args[4]);
                    }
                }
            }
        } else {
            branch = await getDefaultBranch(owner, repo) || 'main';
        }

        if (!await checkBranchExists(owner, repo, branch)) {
            return sendMessage(ctx,
                `❌ Ветка <b>${escapeHtml(branch)}</b> не найдена в репозитории <b>${escapeHtml(repoKey)}</b>`,
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