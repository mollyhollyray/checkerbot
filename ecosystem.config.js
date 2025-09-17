module.exports = {
  apps: [{
    name: 'bot',
    script: 'bot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    // Логирование
    log_file: 'logs/bot.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // Перезагрузка при изменении файлов
    watch: ['*.js', 'commands/*.js', 'service/*.js', 'utils/*.js'],
    ignore_watch: ['node_modules', 'logs', 'data'],
    watch_options: {
      followSymlinks: false
    }
  }]
};