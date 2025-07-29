const { fetchRepoBranches, getBranchLastCommit, getDefaultBranch, getTotalBranchesCount, checkBranchExists } = require('../service/github');
const { sendMessage, sendLongMessage, escapeHtml } = require('../utils/message');
const { log, logError } = require('../utils/logger');
const storage = require('../service/storage');
const NodeCache = require('node-cache');

const branchesCache = new NodeCache({ stdTTL: 300 });
const DEFAULT_BRANCHES_LIMIT = 15;
const MAX_BRANCHES_LIMIT = 50;

module.exports = async (ctx) => {
    try {
        console.log('Command context:', {
            text: ctx.message?.text,
            callback: ctx.callbackQuery?.data
        });

        let args;
        if (ctx.callbackQuery) {
            const callbackData = ctx.callbackQuery.data.split(' ');
            args = ['/branches', callbackData[1] || ''];
        } else {
            args = ctx.message.text.split(' ').filter(arg => arg.trim());
        }

        if (!args[1]?.includes('/')) {
            const defaultRepo = storage.getFirstRepo();
            if (!defaultRepo) {
                await sendMessage(
                    ctx,
                    '<b>❌ Нет отслеживаемых репозиториев</b>\n\n' +
                    'Добавьте репозиторий командой /add',
                    { parse_mode: 'HTML' }
                );
                if (ctx.callbackQuery) await ctx.answerCbQuery();
                return;
            }
            args[1] = defaultRepo;
        }

        const [owner, repo] = args[1].split('/');
        const repoName = `${owner}/${repo}`;
        let limit = DEFAULT_BRANCHES_LIMIT;

        if (args.length >= 3 && !isNaN(args[2])) {
            limit = Math.min(parseInt(args[2]), MAX_BRANCHES_LIMIT);
        }

        await ctx.replyWithChatAction('typing');

        const cacheKey = `${repoName}-branches-${limit}`;
        const cached = branchesCache.get(cacheKey);
        if (cached) {
            await sendMessage(ctx, cached, { parse_mode: 'HTML' });
            if (ctx.callbackQuery) await ctx.answerCbQuery();
            return;
        }

        const [totalBranches, branches, defaultBranch] = await Promise.all([
            getTotalBranchesCount(owner, repo),
            fetchRepoBranches(owner, repo, limit),
            getDefaultBranch(owner, repo)
        ]);

        if (!branches?.length) {
            const msg = `🌿 <b>${escapeHtml(repoName)}</b>\n\nВ репозитории не найдено веток`;
            await sendMessage(ctx, msg, { parse_mode: 'HTML' });
            if (ctx.callbackQuery) await ctx.answerCbQuery();
            return;
        }

        const branchesWithStatus = await Promise.all(
            branches.map(async branch => {
                const commit = await getBranchLastCommit(owner, repo, branch);
                return {
                    name: branch,
                    lastCommit: commit?.commit?.author?.date,
                    lastCommitSha: commit?.sha,
                    commitUrl: commit?.html_url || ''
                };
            })
        );
        
        branchesWithStatus.sort((a, b) => {
            if (a.name === defaultBranch) return -1;
            if (b.name === defaultBranch) return 1;
            return new Date(b.lastCommit) - new Date(a.lastCommit);
        });

        let message = `🌳 <b>${escapeHtml(repoName)}</b> 🌳\n` +
                     `📊 <b>Всего веток:</b> ${totalBranches} (показано ${branches.length})\n` +
                     '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n\n';

        branchesWithStatus.forEach(branch => {
            const isDefault = branch.name === defaultBranch;
            const statusEmoji = getBranchEmoji(branch.lastCommit);
            const shortSha = branch.lastCommitSha?.slice(0, 7) || 'unknown';
            const date = branch.lastCommit ? formatDate(branch.lastCommit) : 'неизвестно';
            
            message += `${isDefault ? '👑' : '▸'} <b>${escapeHtml(branch.name)}</b> ` +
                      (isDefault ? '(по умолчанию)' : '') + '\n' +
                      `   ${statusEmoji} Последний коммит: ${date}\n` +
                      `   🆔 ${shortSha} <a href="${branch.commitUrl}">Ссылка</a>\n\n`;
        });

        message += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n' +
                  `Для просмотра коммитов: /last ${escapeHtml(repoName)} [ветка]\n` +
                  `Чтобы показать больше веток: /branches ${escapeHtml(repoName)} [количество]`;

        branchesCache.set(cacheKey, message);
        await sendLongMessage(ctx, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        if (ctx.callbackQuery) await ctx.answerCbQuery();

    } catch (error) {
        logError(error, `Branches command failed: ${error.message}`);
        
        const errorMsg = error.response?.status === 404
            ? 'Репозиторий не найден'
            : error.message || 'Неизвестная ошибка';
        
        await sendMessage(
            ctx,
            `❌ Ошибка: ${escapeHtml(errorMsg)}`,
            { parse_mode: 'HTML' }
        );
        
        if (ctx.callbackQuery) await ctx.answerCbQuery('❌ Ошибка');
    }
};

function getBranchEmoji(lastCommitDate) {
    if (!lastCommitDate) return '🔴';
    const daysDiff = (Date.now() - new Date(lastCommitDate)) / (1000 * 60 * 60 * 24);
    if (daysDiff < 7) return '🟢';
    if (daysDiff < 30) return '🟡';
    return '🔴';
}

function formatDate(dateString) {
    if (!dateString) return 'неизвестно';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}