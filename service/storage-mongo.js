const mongoose = require('mongoose');
const config = require('../config');
const { log } = require('../utils/logger');

// Схема для репозиториев
const repoSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    index: true // Добавляем index здесь, а не через schema.index()
  },
  owner: { 
    type: String, 
    required: true,
    index: true 
  },
  repo: { 
    type: String, 
    required: true 
  },
  defaultBranch: { 
    type: String, 
    default: 'main' 
  },
  branch: { 
    type: String, 
    default: 'main' 
  },
  addedAt: { 
    type: Date, 
    default: Date.now 
  },
  lastCommitSha: String,
  lastCommitTime: { 
    type: Number,
    index: true 
  },
  lastCommitMessage: String,
  lastReleaseTag: String,
  lastReleaseTime: Number,
  lastReleaseName: String,
  lastReleaseUrl: String,
  trackedBranches: { 
    type: [String], 
    default: ['main'] 
  },
  lastBranchesCheck: { 
    type: Number, 
    default: 0 
  },
  trackedIndividually: { 
    type: Boolean, 
    default: true,
    index: true 
  },
  fromOwner: String,
  isEmpty: { 
    type: Boolean, 
    default: false 
  },
  archived: { 
    type: Boolean, 
    default: false 
  }
}, {
  timestamps: true
});

// Схема для владельцев
const ownerSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    index: true 
  },
  addedAt: { 
    type: Date, 
    default: Date.now 
  },
  lastChecked: { 
    type: Number, 
    default: Date.now 
  },
  repoCount: { 
    type: Number, 
    default: 0 
  },
  autoTracked: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

// Убираем дублирующиеся индексы, так как они уже объявлены в полях
// repoСhema.index({ owner: 1, repo: 1 }); // Убрать эту строку
// repoSchema.index({ lastCommitTime: -1 }); // Убрать эту строку
// repoSchema.index({ trackedIndividually: 1 }); // Убрать эту строку
// repoSchema.index({ key: 1 }, { unique: true }); // Убрать эту строку

// ownerSchema.index({ username: 1 }, { unique: true }); // Убрать эту строку

const Repo = mongoose.model('Repo', repoSchema);
const Owner = mongoose.model('Owner', ownerSchema);

class MongoStorage {
  constructor() {
    this.isConnected = false;
    this.Repo = null;
    this.Owner = null;
  }

  async init() {
    try {
      await mongoose.connect(config.MONGODB_URI, {
        dbName: config.MONGODB_DATABASE,
        serverSelectionTimeoutMS: 5000
      });
      
      this.isConnected = true;
      this.Repo = Repo;
      this.Owner = Owner;
      
      log('MongoDB подключен успешно', 'info');
      return true;
    } catch (error) {
      log(`Ошибка подключения к MongoDB: ${error.message}`, 'error');
      return false;
    }
  }

  async save() {
    return true;
  }

  // Репозитории
  async getRepos() {
    try {
      const repos = await this.Repo.find({ archived: { $ne: true } }).lean();
      return repos.map(repo => [
        repo.key,
        {
          defaultBranch: repo.defaultBranch,
          branch: repo.branch,
          addedAt: repo.addedAt.toISOString(),
          lastCommitSha: repo.lastCommitSha,
          lastCommitTime: repo.lastCommitTime,
          lastCommitMessage: repo.lastCommitMessage,
          lastReleaseTag: repo.lastReleaseTag,
          lastReleaseTime: repo.lastReleaseTime,
          lastReleaseName: repo.lastReleaseName,
          lastReleaseUrl: repo.lastReleaseUrl,
          trackedBranches: repo.trackedBranches || [],
          lastBranchesCheck: repo.lastBranchesCheck || 0,
          trackedIndividually: repo.trackedIndividually,
          fromOwner: repo.fromOwner,
          isEmpty: repo.isEmpty || false
        }
      ]);
    } catch (error) {
      log(`Ошибка получения репозиториев: ${error.message}`, 'error');
      return [];
    }
  }

  async addRepo(owner, repo, data) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      
      const existing = await this.Repo.findOne({ key });
      if (existing) {
        return false;
      }

      const repoData = {
        key,
        owner: owner.toLowerCase(),
        repo: repo.toLowerCase(),
        defaultBranch: data.defaultBranch || 'main',
        branch: data.branch || data.defaultBranch || 'main',
        lastCommitSha: data.lastCommitSha,
        lastCommitTime: data.lastCommitTime,
        trackedBranches: data.trackedBranches || [data.branch || data.defaultBranch || 'main'],
        trackedIndividually: true,
        ...data
      };

      await this.Repo.create(repoData);
      log(`Репозиторий добавлен в MongoDB: ${key}`, 'info');
      return true;
    } catch (error) {
      log(`Ошибка добавления репозитория: ${error.message}`, 'error');
      return false;
    }
  }

  async addRepoFromOwner(owner, repo, data) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      
      const existing = await this.Repo.findOne({ key });
      if (existing) {
        return false;
      }

      const repoData = {
        key,
        owner: owner.toLowerCase(),
        repo: repo.toLowerCase(),
        defaultBranch: data.defaultBranch || 'main',
        branch: data.branch || data.defaultBranch || 'main',
        lastCommitSha: data.lastCommitSha,
        lastCommitTime: data.lastCommitTime,
        trackedBranches: data.trackedBranches || [data.branch || data.defaultBranch || 'main'],
        trackedIndividually: false,
        fromOwner: owner.toLowerCase(),
        isEmpty: data.isEmpty || false,
        ...data
      };

      await this.Repo.create(repoData);
      return true;
    } catch (error) {
      log(`Ошибка добавления репозитория от владельца: ${error.message}`, 'error');
      return false;
    }
  }

  async removeRepo(owner, repo) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const result = await this.Repo.deleteOne({ key });
      return result.deletedCount > 0;
    } catch (error) {
      log(`Ошибка удаления репозитория: ${error.message}`, 'error');
      return false;
    }
  }

  async repoExists(owner, repo) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const count = await this.Repo.countDocuments({ key });
      return count > 0;
    } catch (error) {
      log(`Ошибка проверки существования репозитория: ${error.message}`, 'error');
      return false;
    }
  }

  async updateRepoCommit(owner, repo, commitData) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const repoDoc = await this.Repo.findOne({ key });
      
      if (!repoDoc) return false;

      const lastCommitTime = new Date(commitData.commit.committer.date).getTime();
      
      if (repoDoc.lastCommitSha !== commitData.sha) {
        repoDoc.lastCommitSha = commitData.sha;
        repoDoc.lastCommitTime = lastCommitTime;
        repoDoc.lastCommitMessage = commitData.commit.message;
        await repoDoc.save();
        return true;
      }
      return false;
    } catch (error) {
      log(`Ошибка обновления коммита: ${error.message}`, 'error');
      return false;
    }
  }

  async updateRepoRelease(owner, repo, releaseData) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const repoDoc = await this.Repo.findOne({ key });
      
      if (!repoDoc) return false;

      const lastReleaseTime = new Date(releaseData.published_at || releaseData.created_at).getTime();
      
      if (repoDoc.lastReleaseTag !== releaseData.tag_name) {
        repoDoc.lastReleaseTag = releaseData.tag_name;
        repoDoc.lastReleaseTime = lastReleaseTime;
        repoDoc.lastReleaseName = releaseData.name;
        repoDoc.lastReleaseUrl = releaseData.html_url;
        await repoDoc.save();
        return true;
      }
      return false;
    } catch (error) {
      log(`Ошибка обновления релиза: ${error.message}`, 'error');
      return false;
    }
  }

  async updateRepoBranches(owner, repo, branches, newBranches = []) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const repoDoc = await this.Repo.findOne({ key });
      
      if (!repoDoc) return false;

      repoDoc.trackedBranches = branches;
      repoDoc.lastBranchesCheck = Date.now();
      await repoDoc.save();
      return true;
    } catch (error) {
      log(`Ошибка обновления веток: ${error.message}`, 'error');
      return false;
    }
  }

  async getRepoBranches(owner, repo) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const repoDoc = await this.Repo.findOne({ key });
      return repoDoc ? repoDoc.trackedBranches || [] : [];
    } catch (error) {
      log(`Ошибка получения веток: ${error.message}`, 'error');
      return [];
    }
  }

  async getRepoReleaseInfo(owner, repo) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const repoDoc = await this.Repo.findOne({ key });
      
      if (!repoDoc) return null;
      
      return {
        lastReleaseTag: repoDoc.lastReleaseTag,
        lastReleaseTime: repoDoc.lastReleaseTime,
        lastReleaseName: repoDoc.lastReleaseName,
        lastReleaseUrl: repoDoc.lastReleaseUrl
      };
    } catch (error) {
      log(`Ошибка получения информации о релизе: ${error.message}`, 'error');
      return null;
    }
  }

  async getFirstRepo() {
    try {
      const repo = await this.Repo.findOne({ archived: { $ne: true } })
        .sort({ addedAt: 1 })
        .lean();
      
      return repo ? repo.key : null;
    } catch (error) {
      log(`Ошибка получения первого репозитория: ${error.message}`, 'error');
      return null;
    }
  }

  async getReposByOwner(owner) {
    try {
      const repos = await this.Repo.find({
        owner: owner.toLowerCase(),
        trackedIndividually: false,
        archived: { $ne: true }
      }).lean();
      
      return repos.map(repo => [
        repo.key,
        {
          defaultBranch: repo.defaultBranch,
          branch: repo.branch,
          addedAt: repo.addedAt.toISOString(),
          lastCommitSha: repo.lastCommitSha,
          lastCommitTime: repo.lastCommitTime,
          lastCommitMessage: repo.lastCommitMessage,
          lastReleaseTag: repo.lastReleaseTag,
          lastReleaseTime: repo.lastReleaseTime,
          trackedBranches: repo.trackedBranches || [],
          lastBranchesCheck: repo.lastBranchesCheck || 0,
          trackedIndividually: false,
          fromOwner: repo.fromOwner,
          isEmpty: repo.isEmpty || false
        }
      ]);
    } catch (error) {
      log(`Ошибка получения репозиториев владельца: ${error.message}`, 'error');
      return [];
    }
  }

  async isRepoIndividuallyTracked(owner, repo) {
    try {
      const key = `${owner}/${repo}`.toLowerCase();
      const repoDoc = await this.Repo.findOne({ key });
      return repoDoc ? repoDoc.trackedIndividually : false;
    } catch (error) {
      log(`Ошибка проверки типа отслеживания: ${error.message}`, 'error');
      return false;
    }
  }

  // Владельцы
  async addOwner(owner) {
    try {
      const username = owner.toLowerCase();
      
      const existing = await this.Owner.findOne({ username });
      if (existing) {
        return false;
      }

      await this.Owner.create({
        username,
        addedAt: new Date(),
        lastChecked: Date.now(),
        repoCount: 0,
        autoTracked: true
      });
      
      return true;
    } catch (error) {
      log(`Ошибка добавления владельца: ${error.message}`, 'error');
      return false;
    }
  }

  async removeOwner(owner) {
    try {
      const username = owner.toLowerCase();
      const result = await this.Owner.deleteOne({ username });
      return result.deletedCount > 0;
    } catch (error) {
      log(`Ошибка удаления владельца: ${error.message}`, 'error');
      return false;
    }
  }

  async ownerExists(owner) {
    try {
      const username = owner.toLowerCase();
      const count = await this.Owner.countDocuments({ username });
      return count > 0;
    } catch (error) {
      log(`Ошибка проверки существования владельца: ${error.message}`, 'error');
      return false;
    }
  }

  async getTrackedOwners() {
    try {
      const owners = await this.Owner.find({}).lean();
      return owners.map(owner => owner.username);
    } catch (error) {
      log(`Ошибка получения владельцев: ${error.message}`, 'error');
      return [];
    }
  }

  async updateOwnerReposCount(owner, count) {
    try {
      const username = owner.toLowerCase();
      const ownerDoc = await this.Owner.findOne({ username });
      
      if (ownerDoc) {
        ownerDoc.repoCount = count;
        ownerDoc.lastChecked = Date.now();
        await ownerDoc.save();
        return true;
      }
      return false;
    } catch (error) {
      log(`Ошибка обновления счетчика репозиториев: ${error.message}`, 'error');
      return false;
    }
  }

  async getOwnerStats() {
    try {
      const owners = await this.Owner.find({}).lean();
      return owners.map(owner => ({
        username: owner.username,
        addedAt: owner.addedAt,
        lastChecked: owner.lastChecked,
        repoCount: owner.repoCount
      }));
    } catch (error) {
      log(`Ошибка получения статистики владельцев: ${error.message}`, 'error');
      return [];
    }
  }

  // Миграция данных из старого формата
  async migrateFromFileStorage(fileStorage) {
    try {
      log('Начинаем миграцию данных в MongoDB...', 'info');
      
      const repos = fileStorage.getRepos();
      const owners = fileStorage.getTrackedOwners();
      
      // Мигрируем владельцев
      for (const owner of owners) {
        await this.addOwner(owner);
        log(`Владелец мигрирован: ${owner}`, 'info');
      }
      
      // Мигрируем репозитории
      let migratedCount = 0;
      for (const [key, repoData] of repos) {
        const [owner, repo] = key.split('/');
        
        const success = repoData.trackedIndividually 
          ? await this.addRepo(owner, repo, repoData)
          : await this.addRepoFromOwner(owner, repo, repoData);
        
        if (success) {
          migratedCount++;
        }
      }
      
      log(`Миграция завершена: ${migratedCount} репозиториев, ${owners.length} владельцев`, 'info');
      return { repos: migratedCount, owners: owners.length };
    } catch (error) {
      log(`Ошибка миграции данных: ${error.message}`, 'error');
      throw error;
    }
  }

  // Методы для совместимости со старым кодом
  get repos() {
    return {
      has: (key) => this.repoExists(...key.split('/')),
      get: async (key) => {
        const [owner, repo] = key.split('/');
        const repoDoc = await this.Repo.findOne({ key: key.toLowerCase() });
        return repoDoc ? {
          defaultBranch: repoDoc.defaultBranch,
          branch: repoDoc.branch,
          addedAt: repoDoc.addedAt.toISOString(),
          lastCommitSha: repoDoc.lastCommitSha,
          lastCommitTime: repoDoc.lastCommitTime,
          lastCommitMessage: repoDoc.lastCommitMessage,
          lastReleaseTag: repoDoc.lastReleaseTag,
          lastReleaseTime: repoDoc.lastReleaseTime,
          trackedBranches: repoDoc.trackedBranches || [],
          lastBranchesCheck: repoDoc.lastBranchesCheck || 0,
          trackedIndividually: repoDoc.trackedIndividually,
          fromOwner: repoDoc.fromOwner,
          isEmpty: repoDoc.isEmpty || false
        } : undefined;
      }
    };
  }

  get owners() {
    return {
      get: async (username) => {
        const ownerDoc = await this.Owner.findOne({ username: username.toLowerCase() });
        return ownerDoc ? {
          addedAt: ownerDoc.addedAt.toISOString(),
          lastChecked: ownerDoc.lastChecked,
          repoCount: ownerDoc.repoCount
        } : undefined;
      }
    };
  }
}

module.exports = new MongoStorage();