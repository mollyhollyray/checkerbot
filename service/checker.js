const github = require('./github');
const storage = require('./storage');
const logger = require('../utils/logger');
const { escapeHtml, safeCallbackData, createSafeCallback } = require('../utils/message'); // Добавляем импорт

module.exports = {
  async checkAllRepos(bot) {
    const startTime = Date.now();
    const checkId = `check_${Date.now()}`;
    const timestamp = new Date().toISOString();

    logger.log(`🔄 ЗАПУСК ПРОВЕРКИ [${checkId}]`, 'info', {
      context: 'CHECK_START',
      checkId,
      timestamp,
      startTime: new Date().toLocaleString('ru-RU')
    });

    let processedRepos = 0;
    let successfulChecks = 0;
    let failedChecks = 0;
    let newReposFromOwners = 0;

    try {
      const repos = storage.getRepos();
      
      logger.log(`📊 СТАТИСТИКА РЕПОЗИТОРИЕВ`, 'info', {
        context: 'REPOS_STATS',
        checkId,
        totalRepos: repos.length,
        individualRepos: repos.filter(([_, repoData]) => repoData.trackedIndividually).length,
        autoTrackedRepos: repos.filter(([_, repoData]) => !repoData.trackedIndividually).length,
        timestamp: new Date().toLocaleString('ru-RU')
      });

      if (!repos || repos.length === 0) {
        logger.log('❌ НЕТ РЕПОЗИТОРИЕВ ДЛЯ ПРОВЕРКИ', 'warn', {
          context: 'NO_REPOS',
          checkId,
          timestamp: new Date().toLocaleString('ru-RU')
        });
        return [];
      }

      const updates = [];
      const releaseUpdates = [];
      const branchUpdates = [];

      // === ПРОВЕРКА ВСЕХ РЕПОЗИТОРИЕВ ===
      logger.log(`🔍 НАЧИНАЕМ ПРОВЕРКУ ${repos.length} РЕПОЗИТОРИЕВ`, 'info', {
        context: 'REPOS_START',
        checkId,
        reposCount: repos.length,
        startTime: new Date().toLocaleString('ru-RU')
      });

      for (const [repoKey, repoData] of repos) {
        // ВАЖНО: Теперь проверяем ВСЕ репозитории, включая авто-отслеживаемые
        processedRepos++;
        const repoStartTime = Date.now();

        try {
          const [owner, repo] = repoKey.split('/');
          const branch = repoData.branch || repoData.defaultBranch || 'main';

          logger.log(`📝 ПРОВЕРКА РЕПОЗИТОРИЯ: ${repoKey}`, 'info', {
            context: 'REPO_CHECK_START',
            checkId,
            repoKey,
            branch,
            trackedIndividually: repoData.trackedIndividually,
            fromOwner: repoData.fromOwner || null,
            lastCommit: repoData.lastCommitSha ? `${repoData.lastCommitSha.slice(0, 7)} (${new Date(repoData.lastCommitTime).toLocaleString('ru-RU')})` : 'нет данных',
            lastRelease: repoData.lastReleaseTag ? `${repoData.lastReleaseTag} (${new Date(repoData.lastReleaseTime).toLocaleString('ru-RU')})` : 'нет данных',
            startTime: new Date().toLocaleString('ru-RU')
          });

          // === ПРОВЕРКА КОММИТОВ ===
          const latestCommit = await github.getBranchLastCommit(owner, repo, branch);

          if (!latestCommit || !latestCommit.sha) {
            logger.error(`❌ НЕ УДАЛОСЬ ПОЛУЧИТЬ КОММИТ ДЛЯ ${repoKey}`, null, {
              context: 'COMMIT_FETCH_FAILED',
              checkId,
              repoKey,
              branch,
              error: 'NO_COMMIT_DATA',
              timestamp: new Date().toLocaleString('ru-RU')
            });
            failedChecks++;
            continue;
          }

          const commitDate = new Date(latestCommit.commit.committer.date);
          const commitMessage = latestCommit.commit.message.split('\n')[0];

          if (!repoData.lastCommitSha) {
            // Новый репозиторий - инициализация
            await storage.updateRepoCommit(owner, repo, latestCommit);
            
            logger.log(`🎯 НОВЫЙ РЕПОЗИТОРИЙ ИНИЦИАЛИЗИРОВАН: ${repoKey}`, 'info', {
              context: 'NEW_REPO_INIT',
              checkId,
              repoKey,
              branch,
              firstCommit: {
                sha: latestCommit.sha.slice(0, 7),
                message: commitMessage,
                author: latestCommit.commit.author.name,
                date: commitDate.toLocaleString('ru-RU'),
                timestamp: commitDate.toISOString()
              },
              initTime: new Date().toLocaleString('ru-RU')
            });
            successfulChecks++;
            continue;
          }

          if (latestCommit.sha !== repoData.lastCommitSha) {
            // Обнаружено обновление коммита
            const oldCommitDate = repoData.lastCommitTime ? new Date(repoData.lastCommitTime) : null;
            
            logger.log(`🔄 ОБНАРУЖЕНО ОБНОВЛЕНИЕ КОММИТА: ${repoKey}`, 'info', {
              context: 'COMMIT_UPDATE',
              checkId,
              repoKey,
              branch,
              oldCommit: {
                sha: repoData.lastCommitSha.slice(0, 7),
                date: oldCommitDate ? oldCommitDate.toLocaleString('ru-RU') : 'неизвестно',
                timestamp: repoData.lastCommitTime || 'неизвестно'
              },
              newCommit: {
                sha: latestCommit.sha.slice(0, 7),
                message: commitMessage,
                author: latestCommit.commit.author.name,
                date: commitDate.toLocaleString('ru-RU'),
                timestamp: commitDate.toISOString()
              },
              updateTime: new Date().toLocaleString('ru-RU'),
              timeSinceLastUpdate: oldCommitDate ? `${Math.round((Date.now() - oldCommitDate.getTime()) / (1000 * 60 * 60))} часов` : 'неизвестно'
            });

            updates.push({
              repoKey,
              branch,
              newSha: latestCommit.sha,
              oldSha: repoData.lastCommitSha,
              message: commitMessage,
              url: latestCommit.html_url
            });

            await storage.updateRepoCommit(owner, repo, latestCommit);
            await this.sendUpdateNotification(bot, updates[updates.length - 1]);
          } else {
            logger.log(`✅ КОММИТЫ АКТУАЛЬНЫ: ${repoKey}`, 'debug', {
              context: 'COMMIT_CURRENT',
              checkId,
              repoKey,
              branch,
              lastCommit: {
                sha: latestCommit.sha.slice(0, 7),
                date: commitDate.toLocaleString('ru-RU')
              },
              checkTime: new Date().toLocaleString('ru-RU')
            });
          }

          // === ПРОВЕРКА РЕЛИЗОВ ===
          const latestRelease = await github.fetchLatestRelease(owner, repo);
          
          if (latestRelease) {
            const releaseDate = new Date(latestRelease.published_at || latestRelease.created_at);
            const currentReleaseTag = repoData.lastReleaseTag;
            const currentReleaseTime = repoData.lastReleaseTime || 0;
            
            if (!currentReleaseTag) {
              // Первый релиз
              logger.log(`🎉 ОБНАРУЖЕН ПЕРВЫЙ РЕЛИЗ: ${repoKey}`, 'info', {
                context: 'FIRST_RELEASE',
                checkId,
                repoKey,
                release: {
                  tag: latestRelease.tag_name,
                  name: latestRelease.name,
                  date: releaseDate.toLocaleString('ru-RU'),
                  timestamp: releaseDate.toISOString(),
                  url: latestRelease.html_url
                },
                discoveryTime: new Date().toLocaleString('ru-RU')
              });

              releaseUpdates.push({
                repoKey,
                release: latestRelease,
                isNew: true,
                isUpdate: false
              });
              
              await storage.updateRepoRelease(owner, repo, latestRelease);
              await this.sendReleaseNotification(bot, releaseUpdates[releaseUpdates.length - 1]);
              
            } else if (currentReleaseTag !== latestRelease.tag_name) {
              // Новый релиз
              const oldReleaseDate = new Date(currentReleaseTime);
              
              logger.log(`🆕 ОБНАРУЖЕН НОВЫЙ РЕЛИЗ: ${repoKey}`, 'info', {
                context: 'NEW_RELEASE',
                checkId,
                repoKey,
                oldRelease: {
                  tag: currentReleaseTag,
                  date: oldReleaseDate.toLocaleString('ru-RU'),
                  timestamp: currentReleaseTime
                },
                newRelease: {
                  tag: latestRelease.tag_name,
                  name: latestRelease.name,
                  date: releaseDate.toLocaleString('ru-RU'),
                  timestamp: releaseDate.toISOString(),
                  url: latestRelease.html_url
                },
                timeBetweenReleases: `${Math.round((releaseDate.getTime() - oldReleaseDate.getTime()) / (1000 * 60 * 60 * 24))} дней`,
                discoveryTime: new Date().toLocaleString('ru-RU')
              });

              releaseUpdates.push({
                repoKey,
                release: latestRelease,
                isNew: false,
                isUpdate: true
              });
              
              await storage.updateRepoRelease(owner, repo, latestRelease);
              await this.sendReleaseNotification(bot, releaseUpdates[releaseUpdates.length - 1]);
            } else {
              logger.log(`✅ РЕЛИЗЫ АКТУАЛЬНЫ: ${repoKey}`, 'debug', {
                context: 'RELEASE_CURRENT',
                checkId,
                repoKey,
                currentRelease: {
                  tag: currentReleaseTag,
                  date: new Date(currentReleaseTime).toLocaleString('ru-RU')
                },
                checkTime: new Date().toLocaleString('ru-RU')
              });
            }
          }

          // === ПРОВЕРКА НОВЫХ ВЕТОК ===
          // Проверяем новые ветки для ВСЕХ репозиториев
          const newBranchUpdates = await this.checkNewBranches(bot, owner, repo, repoData);
          if (newBranchUpdates.length > 0) {
            branchUpdates.push(...newBranchUpdates);
            logger.log(`🌿 ОБНАРУЖЕНО ${newBranchUpdates.length} НОВЫХ ВЕТОК: ${repoKey}`, 'info', {
              context: 'BRANCH_UPDATES_FOUND',
              repoKey,
              newBranchesCount: newBranchUpdates.length
            });
          }

          successfulChecks++;

          const repoDuration = Date.now() - repoStartTime;
          logger.log(`✅ РЕПОЗИТОРИЙ ПРОВЕРЕН: ${repoKey}`, 'debug', {
            context: 'REPO_CHECK_COMPLETE',
            checkId,
            repoKey,
            duration: `${repoDuration}ms`,
            endTime: new Date().toLocaleString('ru-RU')
          });

        } catch (error) {
          failedChecks++;
          logger.error(`❌ ОШИБКА ПРОВЕРКИ РЕПОЗИТОРИЯ: ${repoKey}`, error, {
            context: 'REPO_CHECK_ERROR',
            checkId,
            repoKey,
            errorType: error.response?.status ? 'API_ERROR' : 'NETWORK_ERROR',
            statusCode: error.response?.status,
            timestamp: new Date().toLocaleString('ru-RU')
          });
        }
      }

      // === ПРОВЕРКА АВТО-ОТСЛЕЖИВАЕМЫХ ВЛАДЕЛЬЦЕВ (НА НОВЫЕ РЕПОЗИТОРИИ) ===
      const trackedOwners = storage.getTrackedOwners();
      
      if (trackedOwners.length > 0) {
        logger.log(`👥 НАЧИНАЕМ ПРОВЕРКУ ${trackedOwners.length} ВЛАДЕЛЬЦЕВ`, 'info', {
          context: 'OWNER_CHECK_START',
          checkId,
          ownersCount: trackedOwners.length,
          owners: trackedOwners,
          startTime: new Date().toLocaleString('ru-RU')
        });

        for (const owner of trackedOwners) {
          const ownerStartTime = Date.now();
          
          try {
            logger.log(`🔍 ПРОВЕРКА ВЛАДЕЛЬЦА (новые репозитории): ${owner}`, 'info', {
              context: 'OWNER_CHECK_START',
              checkId,
              owner,
              startTime: new Date().toLocaleString('ru-RU')
            });

            const accountType = await github.getAccountType(owner);
            let ownerRepos = [];
            
            if (accountType === 'Organization') {
              ownerRepos = await github.fetchOrgRepos(owner, 50);
            } else {
              ownerRepos = await github.fetchUserRepos(owner, 50);
            }

            logger.log(`📦 ПОЛУЧЕНО РЕПОЗИТОРИЕВ ОТ ${owner}: ${ownerRepos.length}`, 'info', {
              context: 'OWNER_REPOS_FETCHED',
              checkId,
              owner,
              accountType,
              reposCount: ownerRepos.length,
              fetchTime: new Date().toLocaleString('ru-RU')
            });

            let newReposCount = 0;
            const addedRepos = [];

            for (const repo of ownerRepos.slice(0, 30)) {
              const repoKey = `${owner}/${repo.name}`;
              
              if (!storage.repoExists(owner, repo.name)) {
                try {
                  const repoData = await github.fetchRepoData(owner, repo.name);
                  
                  storage.addRepoFromOwner(owner, repo.name, {
                    lastCommitSha: repoData.lastCommitSha,
                    lastCommitTime: repoData.lastCommitTime,
                    defaultBranch: repoData.defaultBranch,
                    isEmpty: repoData.isEmpty || false
                  });
                  
                  newReposCount++;
                  newReposFromOwners++;
                  addedRepos.push({
                    name: repo.name,
                    defaultBranch: repoData.defaultBranch,
                    lastCommit: repoData.lastCommitSha ? `${repoData.lastCommitSha.slice(0, 7)} (${new Date(repoData.lastCommitTime).toLocaleString('ru-RU')})` : 'нет данных',
                    isEmpty: repoData.isEmpty
                  });

                  logger.log(`🎯 ДОБАВЛЕН НОВЫЙ РЕПОЗИТОРИЙ: ${repoKey}`, 'info', {
                    context: 'NEW_REPO_ADDED',
                    checkId,
                    owner,
                    repo: repo.name,
                    repoKey,
                    defaultBranch: repoData.defaultBranch,
                    firstCommit: repoData.lastCommitSha ? repoData.lastCommitSha.slice(0, 7) : 'нет данных',
                    commitDate: repoData.lastCommitTime ? new Date(repoData.lastCommitTime).toLocaleString('ru-RU') : 'нет данных',
                    isEmpty: repoData.isEmpty,
                    addTime: new Date().toLocaleString('ru-RU')
                  });

                  // Отправляем уведомление только для непустых репозиториев
                  if (!repoData.isEmpty) {
                    await this.sendNewRepoNotification(bot, owner, repo.name);
                  }

                } catch (repoError) {
                  logger.error(`❌ ОШИБКА ДОБАВЛЕНИЯ РЕПОЗИТОРИЯ: ${repoKey}`, repoError, {
                    context: 'NEW_REPO_ERROR',
                    checkId,
                    owner,
                    repo: repo.name,
                    errorType: repoError.response?.status ? 'API_ERROR' : 'NETWORK_ERROR',
                    timestamp: new Date().toLocaleString('ru-RU')
                  });
                }
              }
            }

            storage.updateOwnerReposCount(owner, newReposCount);
            
            const ownerDuration = Date.now() - ownerStartTime;
            logger.log(`✅ ПРОВЕРКА ВЛАДЕЛЬЦА ЗАВЕРШЕНА: ${owner}`, 'info', {
              context: 'OWNER_CHECK_COMPLETE',
              checkId,
              owner,
              newReposCount,
              addedRepos: addedRepos.map(r => ({name: r.name, isEmpty: r.isEmpty})),
              totalRepos: ownerRepos.length,
              duration: `${ownerDuration}ms`,
              endTime: new Date().toLocaleString('ru-RU')
            });

          } catch (error) {
            logger.error(`❌ ОШИБКА ПРОВЕРКИ ВЛАДЕЛЬЦА: ${owner}`, error, {
              context: 'OWNER_CHECK_ERROR',
              checkId,
              owner,
              errorType: error.response?.status ? 'API_ERROR' : 'NETWORK_ERROR',
              timestamp: new Date().toLocaleString('ru-RU')
            });
          }
        }
      }

      // === ИТОГОВЫЙ ОТЧЕТ ===
      const totalDuration = Date.now() - startTime;
      const endTime = new Date().toLocaleString('ru-RU');
      
      logger.log(`✅ ПРОВЕРКА ЗАВЕРШЕНА [${checkId}]`, 'info', {
        context: 'CHECK_COMPLETE',
        checkId,
        duration: {
          totalMs: totalDuration,
          totalSeconds: (totalDuration / 1000).toFixed(2),
          totalMinutes: (totalDuration / 1000 / 60).toFixed(2)
        },
        statistics: {
          totalRepos: repos.length,
          processedRepos,
          successfulChecks,
          failedChecks,
          updatesFound: updates.length,
          releasesFound: releaseUpdates.length,
          branchesFound: branchUpdates.length,
          trackedOwners: trackedOwners.length,
          newReposFromOwners
        },
        performance: {
          msPerRepo: (totalDuration / processedRepos).toFixed(2),
          reposPerSecond: (processedRepos / (totalDuration / 1000)).toFixed(2)
        },
        timestamps: {
          start: timestamp,
          end: new Date().toISOString(),
          startLocal: new Date(startTime).toLocaleString('ru-RU'),
          endLocal: endTime
        }
      });

      return [...updates, ...releaseUpdates, ...branchUpdates];
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error(`💥 КРИТИЧЕСКАЯ ОШИБКА ПРОВЕРКИ [${checkId}]`, error, {
        context: 'CHECK_FAILED',
        checkId,
        duration: `${totalDuration}ms`,
        processedRepos,
        successfulChecks,
        failedChecks,
        timestamps: {
          start: timestamp,
          error: new Date().toISOString(),
          startLocal: new Date(startTime).toLocaleString('ru-RU'),
          errorLocal: new Date().toLocaleString('ru-RU')
        }
      });
      return [];
    }
  },

  // Проверка новых веток в репозитории
  async checkNewBranches(bot, owner, repo, repoData) {
    try {
      const repoKey = `${owner}/${repo}`;
      
      // Проверяем ветки не чаще чем раз в 6 часов для ВСЕХ репозиториев
      const now = Date.now();
      const lastCheck = repoData.lastBranchesCheck || 0;
      const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);
      
      if (hoursSinceLastCheck < 6) {
        logger.log(`⏭️ Пропускаем проверку веток для ${repoKey} (проверялось ${Math.round(hoursSinceLastCheck)} часов назад)`, 'debug', {
          context: 'SKIP_BRANCH_CHECK',
          repoKey,
          hoursSinceLastCheck: Math.round(hoursSinceLastCheck),
          trackedIndividually: repoData.trackedIndividually
        });
        return [];
      }

      logger.log(`🌿 ПРОВЕРКА ВЕТОК ДЛЯ: ${repoKey}`, 'info', {
        context: 'BRANCH_CHECK_START',
        repoKey,
        trackedIndividually: repoData.trackedIndividually,
        fromOwner: repoData.fromOwner || null,
        lastCheck: lastCheck ? new Date(lastCheck).toLocaleString('ru-RU') : 'никогда',
        knownBranches: repoData.trackedBranches?.length || 0
      });

      const currentBranches = await github.fetchRepoBranches(owner, repo, 50);
      const knownBranches = repoData.trackedBranches || [];
      
      // Находим новые ветки
      const newBranches = currentBranches.filter(branch => 
        !knownBranches.includes(branch)
      );

      logger.log(`📊 СТАТИСТИКА ВЕТОК: ${repoKey}`, 'info', {
        context: 'BRANCH_STATS',
        repoKey,
        trackedIndividually: repoData.trackedIndividually,
        knownBranches: knownBranches.length,
        currentBranches: currentBranches.length,
        newBranches: newBranches.length,
        newBranchesList: newBranches
      });

      // Сохраняем обновленный список веток
      await storage.updateRepoBranches(owner, repo, currentBranches, newBranches);

      // Отправляем уведомления о новых ветках
      const branchUpdates = [];
      for (const branch of newBranches) {
        try {
          const branchInfo = await github.getBranchLastCommit(owner, repo, branch);
          if (branchInfo) {
            branchUpdates.push({
              repoKey,
              branch,
              commit: branchInfo,
              isNew: true,
              trackedIndividually: repoData.trackedIndividually
            });
            
            await this.sendNewBranchNotification(bot, {
              repoKey,
              branch,
              commit: branchInfo,
              trackedIndividually: repoData.trackedIndividually
            });
          }
        } catch (error) {
          logger.error(`❌ Ошибка получения информации о ветке ${branch}`, error, {
            context: 'BRANCH_INFO_ERROR',
            repoKey,
            branch,
            trackedIndividually: repoData.trackedIndividually
          });
        }
      }

      if (newBranches.length > 0) {
        logger.log(`🎉 ОБНАРУЖЕНЫ НОВЫЕ ВЕТКИ: ${repoKey}`, 'info', {
          context: 'NEW_BRANCHES_FOUND',
          repoKey,
          trackedIndividually: repoData.trackedIndividually,
          newBranchesCount: newBranches.length,
          newBranches: newBranches,
          totalBranches: currentBranches.length
        });
      }

      return branchUpdates;

    } catch (error) {
      logger.error(`❌ ОШИБКА ПРОВЕРКИ ВЕТОК: ${owner}/${repo}`, error, {
        context: 'BRANCH_CHECK_ERROR',
        owner,
        repo,
        trackedIndividually: repoData.trackedIndividually,
        errorType: error.response?.status ? 'API_ERROR' : 'NETWORK_ERROR'
      });
      return [];
    }
  },

  // Уведомление о новой ветке
  async sendNewBranchNotification(bot, branchUpdate) {
    try {
      const { repoKey, branch, commit, trackedIndividually } = branchUpdate;
      const [owner, repo] = repoKey.split('/');
      
      // Добавляем пометку о типе отслеживания
      const trackingType = trackedIndividually ? "индивидуально" : "через владельца";
      
      const commitDate = new Date(commit.commit.committer.date);
      const commitMessage = commit.commit.message.split('\n')[0];
      
      const message = `
🌿 <b>Новая ветка в ${repoKey}</b>
${trackedIndividually ? '' : '\n👤 <i>Отслеживается через владельца</i>'}

🆕 <b>Ветка:</b> <code>${branch}</code>
📝 <b>Последний коммит:</b> ${escapeHtml(commitMessage.substring(0, 100))}
👤 <b>Автор:</b> ${commit.commit.author.name}
📅 <b>Дата:</b> ${commitDate.toLocaleString('ru-RU')}
🔗 <b>Ссылка:</b> ${commit.html_url}

💡 <i>Для просмотра коммитов: /last ${repoKey} ${branch}</i>
      `.trim();

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "📝 Посмотреть коммиты",
              callback_data: createSafeCallback('quick_last', owner, repo, 3, branch)
            },
            {
              text: "🌿 Все ветки",
              callback_data: createSafeCallback('quick_branches', owner, repo, 20)
            }
          ],
          [
            {
              text: "❌ Удалить репозиторий",
              callback_data: createSafeCallback('confirm_remove', owner, repo)
            }
          ]
        ]
      };

      await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        message,
        { 
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: keyboard
        }
      );

      logger.log('Уведомление о новой ветке отправлено', 'info', {
        context: 'sendNewBranchNotification',
        repoKey,
        branch,
        trackedIndividually,
        commitSha: commit.sha.slice(0, 7)
      });

    } catch (error) {
      logger.error('Ошибка отправки уведомления о новой ветке', error, {
        context: 'sendNewBranchNotification',
        repoKey: branchUpdate.repoKey,
        branch: branchUpdate.branch,
        trackedIndividually: branchUpdate.trackedIndividually,
        errorMessage: error.message
      });
    }
  },

  async sendUpdateNotification(bot, update) {
    try {
      const message = this.formatUpdateMessage(update);
      const keyboard = this.createNotificationKeyboard(update);
      
      const sentMessage = await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        message,
        { 
          disable_web_page_preview: true,
          reply_markup: keyboard,
          parse_mode: 'HTML'
        }
      );

      logger.log('Уведомление об обновлении отправлено', 'info', {
        context: 'sendUpdateNotification',
        repoKey: update.repoKey,
        branch: update.branch,
        newSha: update.newSha.slice(0, 7),
        hasPRButton: keyboard.inline_keyboard.length > 0,
        messageId: sentMessage.message_id
      });

    } catch (error) {
      logger.error('Ошибка отправки уведомления об обновлении', error, {
        context: 'sendUpdateNotification',
        repoKey: update.repoKey,
        chatId: process.env.ADMIN_USER_ID,
        errorMessage: error.message,
        stack: error.stack
      });
    }
  },

  async sendReleaseNotification(bot, releaseUpdate) {
    try {
      const message = this.formatReleaseMessage(releaseUpdate);
      
      const sentMessage = await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        message,
        { 
          parse_mode: 'HTML',
          disable_web_page_preview: false
        }
      );

      logger.log('Уведомление о релизе отправлено', 'info', {
        context: 'sendReleaseNotification',
        repoKey: releaseUpdate.repoKey,
        releaseTag: releaseUpdate.release.tag_name,
        isNew: releaseUpdate.isNew,
        messageId: sentMessage.message_id
      });

    } catch (error) {
      logger.error('Ошибка отправки уведомления о релизе', error, {
        context: 'sendReleaseNotification',
        repoKey: releaseUpdate.repoKey,
        chatId: process.env.ADMIN_USER_ID,
        errorMessage: error.message,
        stack: error.stack
      });
    }
  },

  async sendNewRepoNotification(bot, owner, repoName) {
    try {
      const message = `
🎯 <b>Новый репозиторий у отслеживаемого владельца!</b>

👤 <b>Владелец:</b> <code>${owner}</code>
📦 <b>Репозиторий:</b> <code>${repoName}</code>
🔗 <b>Ссылка:</b> https://github.com/${owner}/${repoName}

💡 <i>Репозиторий добавлен в автоматическое отслеживание</i>
      `.trim();

      await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        message,
        { 
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );

      logger.log('Уведомление о новом репозитории отправлено', 'info', {
        context: 'sendNewRepoNotification',
        owner,
        repo: repoName
      });

    } catch (error) {
      logger.error('Ошибка отправки уведомления о новом репозитории', error, {
        context: 'sendNewRepoNotification',
        owner,
        repo: repoName
      });
    }
  },

  createNotificationKeyboard(update) {
    try {
      const [owner, repo] = update.repoKey.split('/');
      const buttons = [];
      
      // Кнопка просмотра PR (если есть номер PR)
      const prMatch = update.message.match(/#(\d+)/);
      if (prMatch && prMatch[1]) {
        buttons.push([{
          text: "📌 Просмотреть PR",
          callback_data: createSafeCallback('prview', owner, repo, prMatch[1])
        }]);
      }

      // Основные команды
      buttons.push(
        [{
          text: "🌿 3 последних коммита",
          callback_data: createSafeCallback('quick_last', owner, repo, 3)
        }],
        [{
          text: "📊 10 активных веток",
          callback_data: createSafeCallback('quick_branches', owner, repo, 10)
        }],
        [{
          text: "🔄 10 последних PR",
          callback_data: createSafeCallback('quick_pr', owner, repo, 10, 'open')
        }],
        [{
          text: "📦 Посмотреть релизы",
          callback_data: createSafeCallback('quick_releases', owner, repo, 10)
        }]
      );

      // Кнопка удаления с подтверждением
      buttons.push([{
        text: "❌ Удалить репозиторий",
        callback_data: createSafeCallback('confirm_remove', owner, repo)
      }]);

      logger.log('Создана клавиатура уведомления', 'debug', {
        context: 'createNotificationKeyboard',
        repoKey: update.repoKey,
        hasPRButton: !!prMatch,
        totalButtons: buttons.flat().length
      });

      return { inline_keyboard: buttons };
      
    } catch (error) {
      logger.error('Ошибка создания клавиатуры', error, {
        context: 'createNotificationKeyboard',
        repoKey: update.repoKey
      });
      return { inline_keyboard: [] };
    }
  },

  formatUpdateMessage(update) {
    const prMatch = update.message.match(/#(\d+)/);
    let prInfo = '';
    
    if (prMatch && prMatch[1]) {
      prInfo = `\n📌 Связанный PR: #${prMatch[1]}`;
    }
    
    return `
🔄 <b>Обновление в ${update.repoKey} (${update.branch})</b>
━━━━━━━━━━━━━━━━━━
<b>Было:</b> <code>${update.oldSha.slice(0, 7)}</code>
<b>Стало:</b> <code>${update.newSha.slice(0, 7)}</code>${prInfo}
📝 ${update.message.substring(0, 100)}
🔗 ${update.url}

<i>Используйте кнопки ниже для быстрых действий:</i>
━━━━━━━━━━━━━━━━━━
    `;
  },

  formatReleaseMessage(releaseUpdate) {
    const { repoKey, release, isNew } = releaseUpdate;
    const emoji = isNew ? '🎉' : '🔄';
    const title = isNew ? 'Новый релиз!' : 'Обновление релиза';
    
    const releaseDate = new Date(release.published_at || release.created_at);
    const formattedDate = releaseDate.toLocaleString('ru-RU');
    
    let message = `
${emoji} <b>${title} в ${repoKey}</b>

📦 <b>Релиз:</b> ${release.name || release.tag_name}
🏷️ <b>Тег:</b> <code>${release.tag_name}</code>
📅 <b>Дата:</b> ${formattedDate}
`;

    if (release.body) {
      const cleanBody = release.body
        .replace(/```/g, '')
        .replace(/#{1,6}\s?/g, '')
        .substring(0, 200);
      message += `📝 <b>Описание:</b> ${cleanBody}...\n`;
    }

    message += `
🔗 <a href="${release.html_url}">Смотреть релиз на GitHub</a>

💡 <i>Для просмотра всех релизов: /releases ${repoKey}</i>
    `.trim();

    return message;
  }
};