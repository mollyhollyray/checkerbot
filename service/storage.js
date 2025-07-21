const fs = require('fs');
const path = require('path');
const config = require('../config');
const { log, logError } = require('../utils/logger');

class Storage {
  constructor() {
    this.repos = new Map();
    this.initStorage();
  }

  /**
   * Инициализация хранилища
   */
  initStorage() {
    try {
      // Создаем папку data если не существует
      if (!fs.existsSync(path.dirname(config.DB_FILE))) {
        fs.mkdirSync(path.dirname(config.DB_FILE), { recursive: true });
      }

      // Загружаем данные если файл существует
      if (fs.existsSync(config.DB_FILE)) {
        const rawData = fs.readFileSync(config.DB_FILE, 'utf-8');
        const data = JSON.parse(rawData);
        
        // Валидация и нормализация загруженных данных
        this.repos = new Map(
          Array.isArray(data) 
            ? data.map(([key, repoData]) => [
                key,
                this.normalizeRepoData(repoData)
              ])
            : []
        );
        
        log(`Storage loaded: ${this.repos.size} repos`);
      }
    } catch (error) {
      logError(error, 'Storage initialization failed');
    }
  }

  /**
   * Нормализация данных репозитория
   */
  normalizeRepoData(repoData) {
    return {
      lastCommitSha: repoData.lastCommitSha || '',
      lastCommitTime: repoData.lastCommitTime || Date.now(),
      defaultBranch: repoData.defaultBranch || 'main',
      addedAt: repoData.addedAt || new Date().toISOString(),
      ...repoData
    };
  }

  /**
   * Сохранение данных
   */
  save() {
    try {
      fs.writeFileSync(
        config.DB_FILE,
        JSON.stringify([...this.repos], null, 2),
        'utf-8'
      );
    } catch (error) {
      logError(error, 'Storage save failed');
    }
  }

  /**
   * Добавление репозитория
   */
  addRepo(owner, repo, data) {
    const key = `${owner}/${repo}`.toLowerCase();
    const normalizedData = this.normalizeRepoData(data);
    
    this.repos.set(key, normalizedData);
    this.save();
    
    log(`Repo added: ${key}`, 'success');
    return true;
  }

  /**
   * Получение всех репозиториев
   */
  getRepos() {
    return Array.from(this.repos.entries()).map(([key, data]) => [
      key,
      this.normalizeRepoData(data)
    ]);
  }

  /**
   * Проверка существования репозитория
   */
  hasRepo(owner, repo) {
    return this.repos.has(`${owner}/${repo}`.toLowerCase());
  }

  /**
   * Удаление репозитория
   */
  removeRepo(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    const result = this.repos.delete(key);
    
    if (result) {
      this.save();
      log(`Repo removed: ${key}`);
    }
    
    return result;
  }
}

// Экспорт синглтона
module.exports = new Storage();