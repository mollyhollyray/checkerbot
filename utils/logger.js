const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const { format } = require('util');
const config = require('../config');

// Создаём поток для записи логов
const logStream = createWriteStream(config.LOG_FILE, {
  flags: 'a', // 'a' означает append (добавление в конец файла)
  encoding: 'utf8',
});

function getTimestamp() {
  return new Date().toISOString();
}

function logToFile(message) {
  try {
    logStream.write(`[${getTimestamp()}] ${message}\n`);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

// Добавляем поддержку цветов в консоль
const colors = {
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  debug: '\x1b[35m', // magenta
  reset: '\x1b[0m', // reset color
};

module.exports = {
  log(message, level = 'info') {
    const formatted = `[${level.toUpperCase()}] ${message}`;
    const colored = `${colors[level] || ''}${formatted}${colors.reset}`;
    
    console.log(colored);
    logToFile(formatted);
  },
  
  logError(error, context = '') {
    const message = context ? `${context}: ${error.message}` : error.message;
    const fullMessage = `[ERROR] ${message}\nStack Trace: ${error.stack}`;
    
    console.error(`${colors.error}${message}${colors.reset}`, error.stack);
    logToFile(fullMessage);
  },

  // Добавляем новые методы для разных уровней логирования
  info(message) {
    this.log(message, 'info');
  },
  
  warn(message) {
    this.log(message, 'warn');
  },
  
  error(message) {
    this.log(message, 'error');
  },
  
  debug(message) {
    if (config.DEBUG) {
      this.log(message, 'debug');
    }
  }
};