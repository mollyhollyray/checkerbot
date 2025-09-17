const { sendMessage, sendLongMessage } = require('../utils/message');
const config = require('../config');
const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);
        const lines = parseInt(args[0]) || 20;

        if (ctx.from.id !== config.ADMIN_USER_ID) {
            return await sendMessage(
                ctx,
                '❌ Эта команда доступна только администратору',
                { parse_mode: 'HTML' }
            );
        }

        if (lines > 100) {
            return await sendMessage(
                ctx,
                '❌ Максимум 100 строк',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');

        // Читаем логи из файла
        let logContent;
        try {
            logContent = await readFile(config.LOG_FILE, 'utf8');
        } catch (error) {
            // Если файла нет, пробуем pm2 logs
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const result = await execAsync(`pm2 logs bot --lines ${lines} --silent`, { 
                timeout: 10000 
            });
            logContent = result.stdout || result.stderr;
        }

        if (!logContent || logContent.trim() === '') {
            return await sendMessage(
                ctx,
                '📭 Логи пусты или не найдены',
                { parse_mode: 'HTML' }
            );
        }

        // Берем последние N строк
        const logLines = logContent.split('\n');
        const lastLines = logLines.slice(-lines).join('\n');
        
        const truncatedOutput = lastLines.length > 3500 
            ? lastLines.substring(0, 3500) + '...\n\n⚠️ Логи обрезаны' 
            : lastLines;

        await sendLongMessage(
            ctx,
            `<b>📋 Последние ${lines} строк логов</b>\n\n` +
            `<pre>${truncatedOutput}</pre>`,
            { 
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }
        );

    } catch (error) {
        await sendMessage(
            ctx,
            `❌ Ошибка чтения логов\n\n` +
            `<code>${error.message}</code>`,
            { parse_mode: 'HTML' }
        );
    }
};