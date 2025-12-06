const fs = require('fs');
const path = require('path');
const config = require('../config');
const FileStorage = require('./old-storage-loader');
const MongoStorage = require('../service/storage-mongo');

async function migrateData() {
  console.log('🚀 Запуск миграции данных в MongoDB...\n');
  
  // Проверяем существование файла данных
  if (!fs.existsSync(config.DB_FILE)) {
    console.error(`❌ Файл данных не найден: ${config.DB_FILE}`);
    process.exit(1);
  }
  
  try {
    // Загружаем старые данные
    const fileStorage = new FileStorage();
    fileStorage.initStorage();
    
    const oldRepos = fileStorage.getRepos();
    const oldOwners = fileStorage.getTrackedOwners();
    
    console.log(`📊 Найдено в файле:`);
    console.log(`   📦 Репозитории: ${oldRepos.length}`);
    console.log(`   👥 Владельцы: ${oldOwners.length}`);
    
    if (oldRepos.length === 0) {
      console.log('✅ Нет данных для миграции');
      process.exit(0);
    }
    
    // Подключаемся к MongoDB
    console.log('\n🔗 Подключаемся к MongoDB...');
    const connected = await MongoStorage.init();
    
    if (!connected) {
      console.error('❌ Не удалось подключиться к MongoDB');
      process.exit(1);
    }
    
    // Выполняем миграцию
    console.log('\n🔄 Начинаем миграцию данных...');
    const result = await MongoStorage.migrateFromFileStorage(fileStorage);
    
    console.log('\n✅ Миграция завершена успешно!');
    console.log(`   📦 Мигрировано репозиториев: ${result.repos}`);
    console.log(`   👥 Мигрировано владельцев: ${result.owners}`);
    
    // Создаем бекап старого файла
    const backupFile = `${config.DB_FILE}.backup-${Date.now()}.json`;
    fs.copyFileSync(config.DB_FILE, backupFile);
    console.log(`\n📁 Создан бекап: ${backupFile}`);
    
    console.log('\n🎉 Все готово! Теперь можно использовать MongoDB.');
    console.log('💡 Не забудьте обновить bot.js для использования нового storage');
    
    process.exit(0);
    
  } catch (error) {
    console.error(`❌ Ошибка при миграции: ${error.message}`);
    process.exit(1);
  }
}

migrateData();