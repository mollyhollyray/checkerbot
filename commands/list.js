const { getDefaultBranch, fetchCommitsByBranch, getTotalCommitsCount, checkBranchExists } = require('../service/github');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const logger = require('../utils/logger');

module.exports = async (ctx) => {
    try {
        // Проверяем, откуда пришел вызов (команда или callback)
        const inputText = ctx.message?.text || ctx.callbackQuery?.data;
        if (!inputText) {
            return await sendMessage(
                ctx,
                '❌ Неверный формат команды',
                { parse_mode: 'MarkdownV2' }
            );
        }

        const args = inputText.split(' ').filter(arg => arg.trim());
        
        if (args.length < 2 || !args[1].includes('/')) {
            return sendMessage(
                ctx,
                '❌ *Неверный формат команды*\n\n' +
                '▸ Используйте: `/last owner/repo [branch] [count=5]`\n' +
                '▸ Примеры:\n' +
                '   `/last facebook/react main 3`\n' +
                '   `/last vuejs/core development`',
                { parse_mode: 'MarkdownV2' }
            );
        }

        const [owner, repo] = args[1].split('/');
        const repoKey = `${owner}/${repo}`.toLowerCase();
        let branch, count = 5, page = 1;

        await ctx.replyWithChatAction('typing');

        // Парсинг аргументов
        if (args.length >= 3) {
            if (!isNaN(args[2])) {
                count = Math.min(parseInt(args[2]), 20);
                branch = await getDefaultBranch(owner, repo) || 'main';
                if (args.length >= 4) page = parseInt(args[3]) || 1;
            } else {
                branch = args[2];
                if (args.length >= 4) count = Math.min(parseInt(args[3]), 20);
            }
        } else {
            branch = await getDefaultBranch(owner, repo) || 'main';
        }

        // Проверка существования ветки
        const branchExists = await checkBranchExists(owner, repo, branch);
        if (!branchExists) {
            return sendMessage(
                ctx,
                `❌ Ветка "${branch}" не найдена в ${repoKey}`,
                { parse_mode: 'MarkdownV2' }
            );
        }

        const [totalCommits, commits] = await Promise.all([
            getTotalCommitsCount(owner, repo, branch),
            fetchCommitsByBranch(owner, repo, branch, count, page)
        ]);

        if (!commits.length) {
            return sendMessage(
                ctx,
                `🔍 В ветке *${escapeMarkdown(branch)}* репозитория *${escapeMarkdown(repoKey)}* нет коммитов.`,
                { parse_mode: 'MarkdownV2' }
            );
        }

        let message = `📌 *Последние коммиты в ${escapeMarkdown(repoKey)} (${escapeMarkdown(branch)}):*\n\n` +
                     `📊 Всего коммитов в ветке: *${totalCommits}*\n` +
                     `📄 Страница: *${page}* из *${Math.ceil(totalCommits/count)}*\n\n`;

        commits.forEach((commit, index) => {
            const commitNumber = totalCommits - ((page-1)*count) - index;
            const date = new Date(commit.commit.author.date);
            const shortSha = commit.sha.substring(0, 7);
            
            message += `🔹 *Коммит #${commitNumber}*\n` +
                      `🆔 Хеш: \`${shortSha}\`\n` +
                      `📅 ${date.toLocaleString('ru-RU')}\n` +
                      `👤 ${escapeMarkdown(commit.commit.author.name)}\n` +
                      `📝 ${escapeMarkdown(truncate(commit.commit.message, 100))}\n` +
                      `🔗 <a href="${commit.html_url}">Ссылка</a>\n\n`;
        });

        if (totalCommits > count) {
            message += `ℹ️ Для просмотра следующей страницы: /last ${repoKey} ${branch} ${count} ${page+1}`;
        }

        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    } catch (error) {
        logger.error(error, 'Last command failed');
        await sendMessage(
            ctx,
            `❌ Ошибка при получении коммитов: ${error.message || 'Неизвестная ошибка'}`,
            { parse_mode: 'MarkdownV2' }
        );
    }
};

function truncate(text, maxLength) {
    return text.length > maxLength 
        ? text.substring(0, maxLength) + '...' 
        : text;
}