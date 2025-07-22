const fs = require('fs');
const path = require('path');
const config = require('../config');
const { log } = require('../utils/logger');

class Storage {
  constructor() {
    this.repos = new Map();
    this.initStorage();
  }

  initStorage() {
    try {
      if (!fs.existsSync(path.dirname(config.DB_FILE))) {
        fs.mkdirSync(path.dirname(config.DB_FILE), { recursive: true });
      }

      if (fs.existsSync(config.DB_FILE)) {
        const data = JSON.parse(fs.readFileSync(config.DB_FILE, 'utf-8'));
        this.repos = new Map(data);
        log(`Загружено ${this.repos.size} репозиториев из хранилища`);
      }
    } catch (error) {
      log(`Ошибка инициализации хранилища: ${error.message}`);
    }
  }

  save() {
    try {
      fs.writeFileSync(
        config.DB_FILE,
        JSON.stringify([...this.repos], null, 2),
        'utf-8'
      );
    } catch (error) {
      log(`Ошибка сохранения хранилища: ${error.message}`);
    }
  }

  getRepos() {
    return [...this.repos];
  }

  addRepo(owner, repo, data) {
    const key = `${owner}/${repo}`.toLowerCase();
    this.repos.set(key, {
      defaultBranch: data.defaultBranch || 'main',
      branch: data.defaultBranch || 'main', // Дублируем для совместимости
      addedAt: new Date().toISOString(),
      ...data
    });
    this.save();
    return true;
  }

  removeRepo(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    const result = this.repos.delete(key);
    if (result) this.save();
    return result;
  }

  updateRepoCommit(owner, repo, commitData) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (this.repos.has(key)) {
      const repoData = this.repos.get(key);
      this.repos.set(key, {
        ...repoData,
        lastCommitSha: commitData.sha,
        lastCommitTime: new Date(commitData.commit.committer.date).getTime(),
        lastCommitMessage: commitData.commit.message
      });
      this.save();
      return true;
    }
    return false;
  }
}

module.exports = new Storage();