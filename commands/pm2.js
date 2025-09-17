const { exec } = require('child_process');
const { sendMessage } = require('../utils/message');
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
                '<code>/pm2 logs</code> - Последние логи\n' +
                '<code>/pm2 update</code> - Обновить и перезапустить',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');

        let result;
        switch (command) {
            case 'restart':
                result = await execAsync('pm2 restart bot');
                break;
            case 'reload':
                result = await execAsync('pm2 reload bot');
                break;
            case 'stop':
                result = await execAsync('pm2 stop bot');
                break;
            case 'start':
                result = await execAsync('pm2 start bot');
                break;
            case 'status':
                result = await execAsync('pm2 status');
                break;
            case 'logs':
                result = await execAsync('pm2 logs bot --lines 20');
                break;
            case 'update':
                result = await execAsync('git pull && pm2 restart bot');
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
        const truncatedOutput = output.length > 2000 
            ? output.substring(0, 2000) + '...' 
            : output;

        await sendMessage(
            ctx,
            `<b>✅ Команда выполнена: ${command}</b>\n\n` +
            `<pre>${truncatedOutput}</pre>`,
            { parse_mode: 'HTML' }
        );

    } catch (error) {
        await sendMessage(
            ctx,
            `❌ Ошибка выполнения команды PM2\n\n` +
            `<code>${error.message}</code>`,
            { parse_mode: 'HTML' }
        );
    }
};