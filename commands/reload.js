const { sendMessage } = require('../utils/message');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// Кэш для отслеживания загруженных модулей
const moduleCache = new Map();

function clearModuleCache(modulePath) {
    try {
        const resolvedPath = require.resolve(modulePath);
        
        // Удаляем из кэша Node.js
        delete require.cache[resolvedPath];
        
        // Удаляем из нашего кэша
        moduleCache.delete(modulePath);
        
        return true;
    } catch (error) {
        console.error(`Error clearing cache for ${modulePath}:`, error);
        return false;
    }
}

function reloadCommand(commandName) {
    try {
        const commandPath = `./commands/${commandName}`;
        const fullPath = path.join(__dirname, '..', 'commands', `${commandName}.js`);
        
        // Проверяем существует ли файл
        if (!fs.existsSync(fullPath)) {
            return { success: false, error: 'File not found' };
        }
        
        // Очищаем кэш
        clearModuleCache(commandPath);
        
        // Перезагружаем модуль
        const newModule = require(commandPath);
        
        // Обновляем в основном боте
        if (require.cache[require.resolve('../bot.js')]) {
            const botModule = require.cache[require.resolve('../bot.js')];
            if (botModule.exports && botModule.exports.commands) {
                botModule.exports.commands[commandName] = newModule;
            }
        }
        
        moduleCache.set(commandName, {
            loaded: new Date(),
            path: commandPath
        });
        
        return { success: true, module: newModule };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function reloadAllCommands() {
    const commandsDir = path.join(__dirname, '..', 'commands');
    const files = fs.readdirSync(commandsDir);
    const results = [];
    
    files.forEach(file => {
        if (file.endsWith('.js') && file !== 'reload.js') {
            const commandName = file.replace('.js', '');
            const result = reloadCommand(commandName);
            results.push({ command: commandName, success: result.success });
        }
    });
    
    return results;
}

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);

        if (ctx.from.id !== config.ADMIN_USER_ID) {
            return await sendMessage(
                ctx,
                '❌ Эта команда доступна только администратору',
                { parse_mode: 'HTML' }
            );
        }

        if (!args.length) {
            // Показываем список команд
            const commandsDir = path.join(__dirname, '..', 'commands');
            const files = fs.readdirSync(commandsDir);
            const commandList = files
                .filter(file => file.endsWith('.js') && file !== 'reload.js')
                .map(file => file.replace('.js', ''))
                .sort();
            
            return await sendMessage(
                ctx,
                '<b>🔄 Горячая перезагрузка команд</b>\n\n' +
                '<i>Использование:</i> <code>/reload commandName</code>\n\n' +
                '<i>Доступные команды:</i>\n' +
                commandList.map(cmd => `<code>${cmd}</code>`).join(', ') + '\n\n' +
                '<code>all</code> - Все команды\n' +
                '<code>list</code> - Список загруженных',
                { parse_mode: 'HTML' }
            );
        }

        const moduleName = args[0].toLowerCase();
        let message = '';

        await ctx.replyWithChatAction('typing');

        if (moduleName === 'all') {
            const results = reloadAllCommands();
            const successful = results.filter(r => r.success).length;
            const total = results.length;
            
            message = `<b>✅ Перезагружено ${successful}/${total} команд</b>\n\n`;
            
            results.forEach(result => {
                message += `${result.success ? '✅' : '❌'} <code>${result.command}</code>\n`;
            });
            
        } else if (moduleName === 'list') {
            const loadedCommands = Array.from(moduleCache.keys());
            message = `<b>📋 Загруженные команды</b>\n\n`;
            
            if (loadedCommands.length === 0) {
                message += 'Нет информации о загруженных командах';
            } else {
                loadedCommands.forEach(cmd => {
                    const info = moduleCache.get(cmd);
                    message += `<code>${cmd}</code> - ${info.loaded.toLocaleTimeString()}\n`;
                });
            }
            
        } else {
            const result = reloadCommand(moduleName);
            
            if (result.success) {
                message = `<b>✅ Команда перезагружена</b>\n\n` +
                         `<code>${moduleName}</code>\n` +
                         `🕒 ${new Date().toLocaleString('ru-RU')}`;
            } else {
                message = `<b>❌ Ошибка перезагрузки</b>\n\n` +
                         `<code>${moduleName}</code>\n` +
                         `Ошибка: <code>${result.error}</code>`;
            }
        }

        await sendMessage(ctx, message, { parse_mode: 'HTML' });

    } catch (error) {
        await sendMessage(
            ctx,
            `❌ Ошибка перезагрузки\n\n` +
            `<code>${error.message}</code>`,
            { parse_mode: 'HTML' }
        );
    }
};