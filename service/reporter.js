const storage = require('./storage');
const { sendMessage } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');

class Reporter {
    constructor() {
        this.lastDailyReport = null;
        this.lastWeeklyReport = null;
    }

    generateASCIIChart(data, width = 20, height = 8) {
        if (!data || data.length === 0) return 'Нет данных';
        
        const maxValue = Math.max(...data.map(d => d.value));
        if (maxValue === 0) return 'Нет активности';
        
        const chart = [];
        
        for (let y = height; y >= 0; y--) {
            let line = '';
            const threshold = (y / height) * maxValue;
            
            data.forEach(item => {
                line += item.value >= threshold ? '█' : ' ';
            });
            
            if (line.trim()) {
                chart.push(line);
            }
        }
        
        let labels = '';
        data.forEach((item, index) => {
            if (index % Math.ceil(data.length / 5) === 0) {
                labels += item.label || ' ';
            } else {
                labels += ' ';
            }
        });
        
        chart.push(labels);
        return chart.join('\n');
    }

    generateActivityChart(repos, days = 7) {
        const activityByDay = Array(days).fill(0);
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        
        repos.forEach(([_, repoData]) => {
            if (repoData.lastCommitTime) {
                const daysAgo = Math.floor((now - repoData.lastCommitTime) / dayMs);
                if (daysAgo < days) {
                    activityByDay[days - daysAgo - 1]++;
                }
            }
        });

        const chartData = activityByDay.map((count, index) => ({
            value: count,
            label: `${days - index - 1}d`
        }));

        return this.generateASCIIChart(chartData);
    }

    generateHourlyActivityChart(repos) {
        const activityByHour = Array(24).fill(0);
        
        repos.forEach(([_, repoData]) => {
            if (repoData.lastCommitTime) {
                const hour = new Date(repoData.lastCommitTime).getUTCHours();
                activityByHour[hour]++;
            }
        });

        const chartData = activityByHour.map((count, hour) => ({
            value: count,
            label: `${hour.toString().padStart(2, '0')}h`
        }));

        return this.generateASCIIChart(chartData, 24, 6);
    }

    generateRecommendations(repos, recentActivity, weeklyActivity, newRepos) {
        const recommendations = [];
        const totalRepos = repos.length;
        const activityPercentage = Math.round((recentActivity / totalRepos) * 100);
        const weeklyPercentage = weeklyActivity ? Math.round((weeklyActivity / totalRepos) * 100) : 0;
        
        const owners = this.getTopOwners(repos, 10);
        const health = this.calculateHealth(repos);
        
        if (activityPercentage === 0) {
            recommendations.push('🔍 Сегодня не было активности - проверьте подключение к GitHub API');
        } else if (activityPercentage < 10) {
            recommendations.push('📉 Очень низкая активность сегодня - возможно, выходной день');
        } else if (activityPercentage > 60) {
            recommendations.push('🎉 Отличная активность! Более 60% репозиториев обновились сегодня');
        }
        
        if (newRepos > 0) {
            recommendations.push(`🆕 Добавлено ${newRepos} новых репозиториев - система расширяется`);
        }
        
        const healthPercentage = Math.round((health.healthy / totalRepos) * 100);
        if (healthPercentage > 80) {
            recommendations.push('✅ Отличное состояние системы - более 80% репозиториев активны');
        } else if (healthPercentage < 30) {
            recommendations.push('⚠️ Низкая активность системы - рассмотрите обновление списка отслеживания');
        }
        
        if (health.critical > totalRepos * 0.3) {
            recommendations.push(`🚨 ${health.critical} репозиториев неактивны более 90 дней - возможно стоит их удалить`);
        }
        
        if (owners.length > 0) {
            const topOwnerCount = owners[0][1];
            const topOwnerPercentage = Math.round((topOwnerCount / totalRepos) * 100);
            
            if (topOwnerPercentage > 50) {
                recommendations.push(`🏆 Владелец ${owners[0][0]} доминирует (${topOwnerPercentage}%) - высокая концентрация`);
            }
            
            if (owners.length >= 3) {
                const top3Total = owners.slice(0, 3).reduce((sum, [_, count]) => sum + count, 0);
                if (top3Total > totalRepos * 0.7) {
                    recommendations.push('📊 Топ-3 владельца контролируют более 70% репозиториев');
                }
            }
        }
        
        if (owners.length >= 8) {
            recommendations.push('🌐 Высокое разнообразие - отслеживаются репозитории от 8+ владельцев');
        } else if (owners.length <= 2) {
            recommendations.push('🎯 Низкое разнообразие - рассмотрите добавление репозиториев от других владельцев');
        }
        
        if (newRepos >= 3) {
            recommendations.push('📈 Активный рост - добавляется много новых репозиториев');
        }
        
        if (weeklyPercentage > activityPercentage * 2) {
            recommendations.push('📅 Активность на неделе выше, чем сегодня - обычный рабочий паттерн');
        }
        
        if (health.healthy > 0 && health.critical === 0) {
            recommendations.push('💚 Все репозитории в хорошем состоянии - отличная работа!');
        }
        
        if (recommendations.length === 0) {
            if (activityPercentage > 30) {
                recommendations.push('👍 Стабильная активность - система работает эффективно');
            } else {
                recommendations.push('📊 Умеренная активность - стандартный рабочий день');
            }
        }
        
        return recommendations.slice(0, 4);
    }

    async sendDailyReport(bot = null) {
        try {
            const targetBot = bot || global.botInstance;
            if (!targetBot) {
                throw new Error('Bot instance not available for daily report');
            }

            const repos = storage.getRepos();
            if (repos.length === 0) {
                logger.info('Нет репозиториев для ежедневного отчета');
                return;
            }

            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            
            const recentActivity = repos.filter(([_, repo]) => 
                repo.lastCommitTime && repo.lastCommitTime > yesterday.getTime()
            ).length;

            const newRepos = repos.filter(([_, repo]) => 
                new Date(repo.addedAt) > yesterday
            ).length;

            const activityChart = this.generateActivityChart(repos, 7);
            const hourlyChart = this.generateHourlyActivityChart(repos);

            let message = '📊 <b>ЕЖЕДНЕВНЫЙ ОТЧЕТ</b>\n';
            message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
            
            message += '🎯 <b>СЕГОДНЯШНИЕ ПОКАЗАТЕЛИ</b>\n';
            message += `📦 Всего репозиториев: <b>${repos.length}</b>\n`;
            message += `🔄 Активных сегодня: <b>${recentActivity}</b>\n`;
            message += `🆕 Новых добавлено: <b>${newRepos}</b>\n`;
            message += `📊 Активность: ${Math.round((recentActivity / repos.length) * 100)}%\n\n`;
            
            if (activityChart && activityChart !== 'Нет данных') {
                message += '📈 <b>АКТИВНОСТЬ ЗА 7 ДНЕЙ</b>\n';
                message += '<pre>';
                message += activityChart;
                message += '</pre>\n\n';
            }
            
            if (hourlyChart && hourlyChart !== 'Нет данных') {
                message += '🕒 <b>АКТИВНОСТЬ ПО ЧАСАМ (UTC)</b>\n';
                message += '<pre>';
                message += hourlyChart;
                message += '</pre>\n\n';
            }

            message += '💡 <b>АНАЛИТИКА И РЕКОМЕНДАЦИИ</b>\n';
            const recommendations = this.generateRecommendations(repos, recentActivity, 0, newRepos);
            recommendations.forEach(rec => {
                message += `• ${rec}\n`;
            });

            const topOwners = this.getTopOwners(repos, 3);
            if (topOwners.length > 0) {
                message += '\n👑 <b>САМЫЕ АКТИВНЫЕ ВЛАДЕЛЬЦЫ</b>\n';
                topOwners.forEach(([owner, count], index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    message += `${medals[index]} <code>${owner}</code> - ${count} репозиториев\n`;
                });
            }
            
            message += `\n📅 ${now.toLocaleDateString('ru-RU')}`;

            await sendMessage(targetBot, config.ADMIN_USER_ID, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            this.lastDailyReport = now;
            logger.info('Ежедневный отчет отправлен', 'info', {
                context: 'DAILY_REPORT',
                repos: repos.length,
                recentActivity,
                newRepos
            });

        } catch (error) {
            logger.error('Ошибка отправки ежедневного отчета', error);
        }
    }

    async sendWeeklyReport(bot = null) {
        try {
            const targetBot = bot || global.botInstance;
            if (!targetBot) {
                throw new Error('Bot instance not available for weekly report');
            }

            const repos = storage.getRepos();
            if (repos.length === 0) {
                logger.info('Нет репозиториев для еженедельного отчета');
                return;
            }

            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const weeklyActivity = repos.filter(([_, repo]) => 
                repo.lastCommitTime && repo.lastCommitTime > weekAgo.getTime()
            ).length;

            const newReposThisWeek = repos.filter(([_, repo]) => 
                new Date(repo.addedAt) > weekAgo
            ).length;

            const activeRepos = repos.filter(([_, repo]) => 
                repo.lastCommitTime && (now.getTime() - repo.lastCommitTime) < 30 * 24 * 60 * 60 * 1000
            ).length;

            const activityChart = this.generateActivityChart(repos, 30);
            const topOwners = this.getTopOwners(repos, 8);

            let message = '📈 <b>ЕЖЕНЕДЕЛЬНЫЙ ОТЧЕТ</b>\n';
            message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
            
            message += '🎯 <b>ЗА ПРОШЕДШУЮ НЕДЕЛЮ</b>\n';
            message += `📦 Всего репозиториев: <b>${repos.length}</b>\n`;
            message += `🔄 Активных за неделю: <b>${weeklyActivity}</b>\n`;
            message += `🆕 Новых добавлено: <b>${newReposThisWeek}</b>\n`;
            message += `✅ Постоянно активных: <b>${activeRepos}</b>\n\n`;
            
            if (activityChart && activityChart !== 'Нет данных') {
                message += '📊 <b>АКТИВНОСТЬ ЗА 30 ДНЕЙ</b>\n';
                message += '<pre>';
                message += activityChart;
                message += '</pre>\n\n';
            }
            
            message += '🏆 <b>ТОП ВЛАДЕЛЬЦЫ</b>\n';
            topOwners.forEach(([owner, count], index) => {
                const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : '▸';
                const percentage = Math.round((count / repos.length) * 100);
                message += `${medal} <code>${owner}</code> - ${count} (${percentage}%)\n`;
            });
            message += '\n';

            message += '📋 <b>СТАТУС СИСТЕМЫ</b>\n';
            const health = this.calculateHealth(repos);
            message += `✅ Здоровые: <b>${health.healthy}</b>\n`;
            message += `⚠️ Требуют внимания: <b>${health.warning}</b>\n`;
            message += `🚨 Проблемные: <b>${health.critical}</b>\n\n`;

            message += '💡 <b>АНАЛИТИКА И РЕКОМЕНДАЦИИ</b>\n';
            const recommendations = this.generateRecommendations(repos, 0, weeklyActivity, newReposThisWeek);
            recommendations.forEach(rec => {
                message += `• ${rec}\n`;
            });
            
            message += `\n📅 Неделя ${this.getWeekNumber(now)} • ${now.toLocaleDateString('ru-RU')}`;

            await sendMessage(targetBot, config.ADMIN_USER_ID, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            this.lastWeeklyReport = now;
            logger.info('Еженедельный отчет отправлен', 'info', {
                context: 'WEEKLY_REPORT',
                repos: repos.length,
                weeklyActivity,
                newReposThisWeek,
                activeRepos
            });

        } catch (error) {
            logger.error('Ошибка отправки еженедельного отчета', error);
        }
    }

    getTopOwners(repos, limit = 5) {
        const owners = {};
        repos.forEach(([repoKey]) => {
            const [owner] = repoKey.split('/');
            if (!owners[owner]) owners[owner] = 0;
            owners[owner]++;
        });
        
        return Object.entries(owners)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    }

    calculateHealth(repos) {
        const now = Date.now();
        let healthy = 0, warning = 0, critical = 0;
        
        repos.forEach(([_, repoData]) => {
            if (!repoData.lastCommitTime) {
                critical++;
                return;
            }
            
            const daysSinceCommit = (now - repoData.lastCommitTime) / (1000 * 60 * 60 * 24);
            
            if (daysSinceCommit <= 30) {
                healthy++;
            } else if (daysSinceCommit <= 90) {
                warning++;
            } else {
                critical++;
            }
        });
        
        return { healthy, warning, critical };
    }

    getWeekNumber(date) {
        const firstDay = new Date(date.getFullYear(), 0, 1);
        const pastDays = (date - firstDay) / 86400000;
        return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
    }

    shouldSendDailyReport() {
        if (!this.lastDailyReport) return true;
        const now = new Date();
        const lastReport = new Date(this.lastDailyReport);
        return now.getDate() !== lastReport.getDate();
    }

    shouldSendWeeklyReport() {
        if (!this.lastWeeklyReport) return true;
        const now = new Date();
        const lastReport = new Date(this.lastWeeklyReport);
        const daysSinceLastReport = (now - lastReport) / (1000 * 60 * 60 * 24);
        return daysSinceLastReport >= 7;
    }
}

module.exports = Reporter;