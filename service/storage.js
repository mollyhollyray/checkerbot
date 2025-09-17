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

  getRepoReleaseInfo(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!this.repos.has(key)) return null;
    
    const repoData = this.repos.get(key);
    return {
        lastReleaseTag: repoData.lastReleaseTag,
        lastReleaseTime: repoData.lastReleaseTime,
        lastReleaseName: repoData.lastReleaseName,
        lastReleaseUrl: repoData.lastReleaseUrl
    };
}
  
getFirstRepo() {
    const repos = this.getRepos();
    return repos.length > 0 ? repos[0][0] : null;
  }

  save() {
    try {
      fs.writeFileSync(
        config.DB_FILE,
        JSON.stringify([...this.repos], null, 2),
        'utf-8'
      );
      return true;
    } catch (error) {
      log(`Ошибка сохранения хранилища: ${error.message}`);
      return false;
    }
  }

  getRepos() {
    return [...this.repos];
  }

 addRepo(owner, repo, data) {
    const key = `${owner}/${repo}`.toLowerCase();
    this.repos.set(key, {
        defaultBranch: data.defaultBranch || 'main',
        branch: data.branch || data.defaultBranch || 'main',
        addedAt: new Date().toISOString(),
        lastCommitSha: data.lastCommitSha,
        lastCommitTime: data.lastCommitTime,
        lastReleaseTag: data.lastReleaseTag || null,
        lastReleaseTime: data.lastReleaseTime || 0,
        ...data
    });
    return this.save();
}

  removeRepo(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    const result = this.repos.delete(key);
    if (result) this.save();
    return result;
  }

  updateRepoRelease(owner, repo, releaseData) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!this.repos.has(key)) return false;

    const repoData = this.repos.get(key);
    const newData = {
        ...repoData,
        lastReleaseTag: releaseData.tag_name,
        lastReleaseTime: new Date(releaseData.published_at || releaseData.created_at).getTime(),
        lastReleaseName: releaseData.name,
        lastReleaseUrl: releaseData.html_url
    };

    if (repoData.lastReleaseTag !== newData.lastReleaseTag) {
        this.repos.set(key, newData);
        return this.save();
    }
    return false;
}


  updateRepoCommit(owner, repo, commitData) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!this.repos.has(key)) return false;

    const repoData = this.repos.get(key);
    const newData = {
      ...repoData,
      lastCommitSha: commitData.sha,
      lastCommitTime: new Date(commitData.commit.committer.date).getTime(),
      lastCommitMessage: commitData.commit.message
    };

    if (repoData.lastCommitSha !== newData.lastCommitSha) {
      this.repos.set(key, newData);
      return this.save();
    }
    return false;
  }

  repoExists(owner, repo) {
    return this.repos.has(`${owner}/${repo}`.toLowerCase());
  }
}

module.exports = new Storage();