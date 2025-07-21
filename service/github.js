const axios = require('axios');
const config = require('../config');
const { log, logError } = require('../utils/logger');

const apiRateLimit = {
  limit: 60,
  remaining: 60,
  reset: Math.floor(Date.now() / 1000) + 3600 // текущее время + 1 час
};

async function makeRequest(url) {
  try {
    if (apiRateLimit.remaining < 5) {
      throw new Error(`GitHub API limit reached. Resets at: ${new Date(apiRateLimit.reset * 1000)}`);
    }

    const response = await axios.get(url, {
      headers: {
        'Authorization': `token ${config.GITHUB_TOKEN}`,
        'User-Agent': 'GitHub-Tracker-Bot'
      }
    });

    // Обновляем лимиты из заголовков ответа
    if (response.headers) {
      apiRateLimit.limit = parseInt(response.headers['x-ratelimit-limit']) || 60;
      apiRateLimit.remaining = parseInt(response.headers['x-ratelimit-remaining']) || 0;
      apiRateLimit.reset = parseInt(response.headers['x-ratelimit-reset']) || Math.floor(Date.now() / 1000) + 3600;
    }

    return response.data;
  } catch (error) {
    logError(error, 'GitHub API request failed');
    throw error;
  }
}

async function fetchRepoBranches(owner, repo) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/branches`,
            {
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'GitHub-Tracker-Bot'
                },
                params: {
                    per_page: 50 // Лимит GitHub API
                }
            }
        );
        
        return response.data.map(b => b.name).sort();
    } catch (error) {
        logError(error, `Failed to fetch branches: ${owner}/${repo}`);
        throw error;
    }
}

async function getDefaultBranch(owner, repo) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}`,
            {
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'GitHub-Tracker-Bot'
                }
            }
        );
        return response.data.default_branch;
    } catch (error) {
        logError(error, `Failed to get default branch: ${owner}/${repo}`);
        return null;
    }
}

async function getBranchLastCommit(owner, repo, branch) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`,
            {
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'GitHub-Tracker-Bot'
                }
            }
        );
        return response.data[0];
    } catch (error) {
        logError(error, `Failed to get branch last commit: ${owner}/${repo}/${branch}`);
        return null;
    }
}

async function getTotalCommitsCount(owner, repo, branch) {
    const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`,
        {
            headers: {
                'Authorization': `token ${config.GITHUB_TOKEN}`,
                'User-Agent': 'GitHub-Tracker-Bot'
            }
        }
    );
    
    // Извлекаем общее количество из заголовков Link
    const linkHeader = response.headers.link;
    if (linkHeader) {
        const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (lastPageMatch) return parseInt(lastPageMatch[1]);
    }
    
    return response.data.length;
}

async function fetchCommitsByBranch(owner, repo, branch, count = 5) {
    const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${count}`,
        {
            headers: {
                'Authorization': `token ${config.GITHUB_TOKEN}`,
                'User-Agent': 'GitHub-Tracker-Bot'
            }
        }
    );
    return response.data;
}

async function fetchRepoData(owner, repo) {
  try {
    const [repoInfo, commits] = await Promise.all([
      makeRequest(`https://api.github.com/repos/${owner}/${repo}`),
      makeRequest(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`)
    ]);

    return {
      lastCommitSha: commits[0]?.sha || '',
      lastCommitTime: commits[0] ? new Date(commits[0].commit.committer.date).getTime() : 0,
      defaultBranch: repoInfo.default_branch || 'main'
    };
  } catch (error) {
    logError(error, `Failed to fetch repo data: ${owner}/${repo}`);
    throw error;
  }
}

module.exports = {
  fetchRepoData,
  apiRateLimit,
  getDefaultBranch,
  fetchRepoBranches,
   getTotalCommitsCount,
   fetchCommitsByBranch,
  getBranchLastCommit
};