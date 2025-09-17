const { exec } = require('child_process');
const { sendMessage, sendLongMessage } = require('../utils/message');
const config = require('../config');
const { promisify } = require('util');

const execAsync = promisify(exec);

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);
        const command = args[0];

        // Проверяем права (только админ)
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
                result = await execAsync('pm2 restart bot --silent');
                break;
            case 'reload':
                result = await execAsync('pm2 reload bot --silent');
                break;
            case 'stop':
                result = await execAsync('pm2 stop bot --silent');
                break;
            case 'start':
                result = await execAsync('pm2 start bot --silent');
                break;
            case 'status':
                result = await execAsync('pm2 status --silent', { timeout: 10000 });
                break;
            case 'logs':
                // Быстрые логи - только последние 10 строк
                result = await execAsync('pm2 logs bot --lines 10 --silent', { timeout: 15000 });
                break;
            case 'update':
                result = await execAsync('git pull && pm2 restart bot --silent', { timeout: 30000 });
                break;
            default:
                return await sendMessage(
                    ctx,
                    '❌ Неизвестная команда PM2',
                    { parse_mode: 'HTML' }
                );
        }

        // Обрезаем длинный вывод
        const output = result.stdout || result.stderr;
        
        if (!output || output.trim() === '') {
            return await sendMessage(
                ctx,
                `<b>✅ Команда выполнена: ${command}</b>\n\n` +
                `Нет вывода или пустой результат`,
                { parse_mode: 'HTML' }
            );
        }

        const truncatedOutput = output.length > 3500 
            ? output.substring(0, 3500) + '...\n\n⚠️ Вывод обрезан' 
            : output;

        await sendLongMessage(
            ctx,
            `<b>✅ Команда выполнена: ${command}</b>\n\n` +
            `<pre>${truncatedOutput}</pre>`,
            { 
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }
        );

    } catch (error) {
        let errorMessage = `❌ Ошибка выполнения команды PM2\n\n`;
        
        if (error.killed) {
            errorMessage += `<code>Таймаут: команда выполнялась слишком долго</code>`;
        } else if (error.code === 'ENOENT') {
            errorMessage += `<code>PM2 не установлен или недоступен</code>`;
        } else {
            errorMessage += `<code>${error.message}</code>`;
        }

        await sendMessage(
            ctx,
            errorMessage,
            { parse_mode: 'HTML' }
        );
    }
};