const chokidar = require('chokidar');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { log } = require('./logger');

const execAsync = promisify(exec);

class FileWatcher {
    constructor(bot) {
        this.bot = bot;
        this.watcher = null;
    }

    start() {
        if (process.env.NODE_ENV !== 'production') {
            this.watcher = chokidar.watch([
                './commands/*.js',
                './service/*.js', 
                './utils/*.js'
            ], {
                ignored: /node_modules/,
                persistent: true
            });

            this.watcher.on('change', async (filePath) => {
                const fileName = path.basename(filePath);
                log(`Файл изменен: ${fileName}`, 'info');
                
                try {
                    await execAsync('pm2 reload bot --silent', { timeout: 10000 });
                    log('Бот перезагружен автоматически', 'info');
                } catch (error) {
                    log(`Ошибка автоматической перезагрузки: ${error.message}`, 'error');
                }
            });

            log('File watcher started', 'info');
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
        }
    }
}

module.exports = FileWatcher;