const { sendMessage } = require('../utils/message');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// Глобальная ссылка на экземпляр бота
let botInstance = null;

function setBotInstance(bot) {
    botInstance = bot;
}

async function reloadCommand(commandName) {
    try {
        const fullPath = path.join(__dirname, '..', 'commands', `${commandName}.js`);
        
        if (!fs.existsSync(fullPath)) {
            return { success: false, error: 'File not found' };
        }

        // 1. Очищаем кэш
        delete require.cache[require.resolve(fullPath)];
        
        // 2. Перезагружаем модуль
        const newCommand = require(fullPath);
        
        // 3. Удаляем старую команду из бота
        const commandHandler = botInstance?.command?.handlers?.find(
            h => h.toString().includes(commandName)
        );
        
        if (commandHandler) {
            // Сложная магия с внутренностями Telegraf
            const index = botInstance.command.handlers.indexOf(commandHandler);
            if (index > -1) {
                botInstance.command.handlers.splice(index, 1);
            }
        }
        
        // 4. Регистрируем новую команду
        botInstance.command(commandName, newCommand);
        
        return { success: true };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);

        if (ctx.from.id !== config.ADMIN_USER_ID) {
            return await sendMessage(ctx, '❌ Только для администратора', { parse_mode: 'HTML' });
        }

        if (!args.length) {
            const commands = fs.readdirSync(path.join(__dirname, '..', 'commands'))
                .filter(f => f.endsWith('.js') && f !== 'reload.js')
                .map(f => f.replace('.js', ''));
            
            return await sendMessage(
                ctx,
                `<b>🔄 Динамическая перезагрузка</b>\n\n` +
                `<i>Доступные команды:</i>\n` +
                commands.map(c => `<code>${c}</code>`).join(', ') +
                `\n\n<code>all</code> - Все команды`,
                { parse_mode: 'HTML' }
            );
        }

        const target = args[0].toLowerCase();
        
        if (target === 'all') {
            // Лучше использовать PM2 для полной перезагрузки
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            await execAsync('pm2 reload bot --silent', { timeout: 10000 });
            
            await sendMessage(
                ctx,
                '<b>✅ Бот перезагружен через PM2</b>\n\n' +
                'Все команды обновлены',
                { parse_mode: 'HTML' }
            );
            
        } else {
            await sendMessage(
                ctx,
                '<b>⚠️ Динамическая перезагрузка отдельных команд</b>\n\n' +
                'В текущей версии для обновления кода команд необходимо:\n' +
                '• Использовать <code>/reload all</code> (PM2 reload)\n' +
                '• Или перезапустить бота вручную\n\n' +
                'Динамическая перезагрузка на лету сложна из-за ограничений Node.js',
                { parse_mode: 'HTML' }
            );
        }

    } catch (error) {
        await sendMessage(
            ctx,
            `❌ Ошибка: ${error.message}`,
            { parse_mode: 'HTML' }
        );
    }
};

module.exports.setBotInstance = setBotInstance;