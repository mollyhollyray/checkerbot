const fs = require('fs');
const path = require('path');
const config = require('../config');

class OldStorageLoader {
  constructor() {
    this.repos = new Map();
    this.owners = new Map();
  }

  initStorage() {
    try {
      if (fs.existsSync(config.DB_FILE)) {
        const data = JSON.parse(fs.readFileSync(config.DB_FILE, 'utf-8'));
        
        if (Array.isArray(data)) {
          // Старый формат - только репозитории
          this.repos = new Map(data);
          this.owners = new Map();
        } else if (data && typeof data === 'object') {
          // Новый формат - с владельцами
          this.repos = new Map(data.repos || []);
          this.owners = new Map(data.owners || []);
        }
        console.log(`Загружено ${this.repos.size} репозиториев`);
      }
    } catch (error) {
      console.error(`Ошибка загрузки файла: ${error.message}`);
    }
  }

  getRepos() {
    return [...this.repos];
  }

  getTrackedOwners() {
    return [...this.owners.keys()];
  }
}

module.exports = OldStorageLoader;