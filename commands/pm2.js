const { exec } = require('child_process');
const { sendMessage, sendLongMessage } = require('../utils/message');
const config = require('../config');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function executePM2Command(command, timeout = 15000) {
    try {
        const result = await execAsync(command, { timeout });
        return { success: true, output: result.stdout || result.stderr };
    } catch (error) {
        if (error.stdout && error.stdout.includes('restarting') ||
            error.stdout && error.stdout.includes('reloaded') ||
            error.stdout && error.stdout.includes('stopped') ||
            error.stdout && error.stdout.includes('started')) {
            return { success: true, output: error.stdout || error.stderr };
        }
        return { success: false, output: error.stderr || error.stdout || error.message };
    }
}

module.exports = async (ctx) => {
    let command;
    
    try {
        const args = ctx.message.text.split(' ').slice(1);
        command = args[0];

        if (ctx.from.id !== config.ADMIN_USER_ID) {
            return await sendMessage(
                ctx,
                '❌ Эта команда доступна только администратору',
                { parse_mode: 'HTML' }
            );
        }

        if (!command) {
            return await sendMessage(
                ctx,
                '<b>🔧 Управление PM2</b>\n\n' +
                '<i>Доступные команды:</i>\n' +
                '<code>/pm2 restart</code> - Перезапустить всего бота\n' +
                '<code>/pm2 reload</code> - Перезагрузить без downtime\n' +
                '<code>/pm2 stop</code> - Остановить бота\n' +
                '<code>/pm2 start</code> - Запустить бота\n' +
                '<code>/pm2 status</code> - Статус процессов\n' +
                '<code>/pm2 logs</code> - Последние логи (10 строк)\n' +
                '<code>/pm2 update</code> - Обновить и перезапустить',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');

        let result;
        switch (command) {
            case 'restart':
                result = await executePM2Command('pm2 restart bot --silent');
                break;
            case 'reload':
                result = await executePM2Command('pm2 reload bot --silent');
                break;
            case 'stop':
                result = await executePM2Command('pm2 stop bot --silent');
                break;
            case 'start':
                result = await executePM2Command('pm2 start bot --silent');
                break;
            case 'status':
                result = await executePM2Command('pm2 status --silent', 10000);
                break;
            case 'logs':
                result = await executePM2Command('pm2 logs bot --lines 10 --silent', 10000);
                break;
            case 'update':
                result = await executePM2Command('git pull && pm2 restart bot --silent', 30000);
                break;
            default:
                return await sendMessage(
                    ctx,
                    '❌ Неизвестная команда PM2',
                    { parse_mode: 'HTML' }
                );
        }

        if (!result.success) {
            throw new Error(result.output);
        }

        const output = result.output;
        
        if (!output || output.trim() === '') {
            return await sendMessage(
                ctx,
                `<b>✅ Команда выполнена: ${command}</b>\n\n` +
                `Процесс успешно завершен`,
                { parse_mode: 'HTML' }
            );
        }

        let message;
        if (output.includes('restarting') || output.includes('reloaded')) {
            message = `<b>✅ Бот успешно перезагружен</b>\n\n` +
                     `Команда: <code>${command}</code>\n` +
                     `🕒 ${new Date().toLocaleString('ru-RU')}`;
        } else if (output.includes('stopped')) {
            message = `<b>✅ Бот остановлен</b>\n\n` +
                     `Команда: <code>${command}</code>`;
        } else if (output.includes('started')) {
            message = `<b>✅ Бот запущен</b>\n\n` +
                     `Команда: <code>${command}</code>`;
        } else {
            const truncatedOutput = output.length > 2000 
                ? output.substring(0, 2000) + '...\n\n⚠️ Вывод обрезан' 
                : output;

            message = `<b>✅ Команда выполнена: ${command}</b>\n\n` +
                     `<pre>${truncatedOutput}</pre>`;
        }

        await sendMessage(
            ctx,
            message,
            { 
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }
        );

    } catch (error) {
        let errorMessage = `❌ Ошибка выполнения команды PM2\n\n`;
        
        if (error.message.includes('Timeout')) {
            errorMessage += `<code>Таймаут: команда выполнялась слишком долго</code>\n\n`;
            errorMessage += `Но процесс мог выполниться успешно`;
        } else if (error.message.includes('Command failed')) {
            errorMessage += `<code>Команда завершилась с ошибкой, но процесс мог выполниться</code>\n\n`;
            errorMessage += `PM2 часто возвращает ошибки даже при успешном выполнении`;
        } else if (error.message.includes('ENOENT')) {
            errorMessage += `<code>PM2 не установлен или недоступен</code>`;
        } else {
            errorMessage += `<code>${error.message}</code>`;
        }

        if (command === 'restart') {
            errorMessage += `\n\n💡 <i>Но бот вероятно перезагрузился успешно</i>`;
        }

        await sendMessage(
            ctx,
            errorMessage,
            { parse_mode: 'HTML' }
        );
    }
};