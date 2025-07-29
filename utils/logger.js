const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const config = require('../config');

const logDir = path.dirname(config.LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
function rotateLogs() {
  if (fs.existsSync(config.LOG_FILE) && fs.statSync(config.LOG_FILE).size > MAX_LOG_SIZE) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newName = `${config.LOG_FILE}.${timestamp}.bak`;
    fs.renameSync(config.LOG_FILE, newName);
  }
}

rotateLogs();

const logStream = createWriteStream(config.LOG_FILE, { flags: 'a', encoding: 'utf8' });

const colors = {
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  debug: '\x1b[35m', // magenta
  reset: '\x1b[0m',
};

function getTimestamp() {
  return new Date().toISOString();
}

function logToFile(level, message, context = {}) {
  const logEntry = JSON.stringify({
    timestamp: getTimestamp(),
    level,
    message,
    context,
  });
  
  try {
    logStream.write(logEntry + '\n');
  } catch (err) {
    console.error('Ошибка записи в лог:', err.message);
  }
}

module.exports = {
  log(message, level = 'info', context = {}) {
    const formatted = `[${level.toUpperCase()}] ${message}`;
    const colored = `${colors[level] || ''}${formatted}${colors.reset}`;
    
    console.log(colored);
    logToFile(level, message, context);
  },

  info(message, context = {}) {
    this.log(message, 'info', context);
  },

  warn(message, context = {}) {
    this.log(message, 'warn', context);
  },

  error(message, error = null, context = {}) {
    const fullContext = { ...context, stack: error?.stack };
    this.log(message, 'error', fullContext);
    console.error(error?.stack || '');
  },

  debug(message, context = {}) {
    if (config.DEBUG) {
      this.log(message, 'debug', context);
    }
  },

  child(prefix) {
    return {
      info: (message) => this.info(`[${prefix}] ${message}`),
      error: (message, error) => this.error(`[${prefix}] ${message}`, error),
    };
  },
};