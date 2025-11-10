/**
 * Тестовый скрипт для проверки тегов задачи
 * Использование: npx tsx scripts/test-task-tags.ts [taskId]
 */

import { BitrixClient } from '../lib/bitrix/client';
import { TaskService } from '../lib/bitrix/services/TaskService';

async function testTaskTags(taskId: string) {
  console.log(`\n🔍 Проверка задачи ${taskId}\n`);

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ BITRIX_WEBHOOK_URL не установлен в .env.local');
    process.exit(1);
  }

  const client = new BitrixClient(webhookUrl);
  const taskService = new TaskService(client);

  try {
    // 1. Получаем задачу напрямую через tasks.task.get
    console.log('📥 Запрашиваем задачу через tasks.task.get...');
    const taskResponse = await client.call<any>('tasks.task.get', {
      taskId,
      select: ['*', 'TAGS']
    });

    console.log('\n📦 Полный ответ от Bitrix API:');
    console.log(JSON.stringify(taskResponse, null, 2));

    // 2. Извлекаем задачу
    const task = taskResponse?.task || taskResponse?.result?.task || taskResponse;

    console.log('\n📋 Извлечённая задача:');
    console.log({
      ID: task.id || task.ID,
      TITLE: task.title || task.TITLE,
      TAGS: task.tags || task.TAGS,
      TAGS_type: typeof (task.tags || task.TAGS),
      TAGS_isArray: Array.isArray(task.tags || task.TAGS),
    });

    // 3. Проверяем теги детально
    const tags = task.tags || task.TAGS || [];
    console.log('\n🏷️ Теги задачи:');
    if (Array.isArray(tags)) {
      console.log(`Найдено ${tags.length} тегов:`);
      tags.forEach((tag, idx) => {
        console.log(`  ${idx + 1}. "${tag}" (тип: ${typeof tag})`);
      });
    } else if (typeof tags === 'object' && tags !== null) {
      console.log('Теги в формате объекта:');
      console.log(JSON.stringify(tags, null, 2));
      const tagValues = Object.values(tags);
      console.log(`Значения: ${tagValues.length} элементов`);
      tagValues.forEach((tag, idx) => {
        console.log(`  ${idx + 1}. "${tag}" (тип: ${typeof tag})`);
      });
    } else {
      console.log('Теги не найдены или в неожиданном формате:', tags);
    }

    // 4. Проверяем через TaskService
    console.log('\n🔄 Проверяем через TaskService.getAllTasks...');
    const taskFromList = await client.call<any>('tasks.task.list', {
      filter: { ID: taskId },
      select: ['*', 'TAGS']
    });

    console.log('\n📦 Ответ от tasks.task.list:');
    console.log(JSON.stringify(taskFromList, null, 2));

    // 5. Тестируем batch API
    console.log('\n🔄 Проверяем через batch API...');
    const batchResponse = await client.batch({
      [`task_${taskId}`]: `tasks.task.get?taskId=${taskId}&select[]=TAGS`
    });

    console.log('\n📦 Ответ от batch API:');
    console.log(JSON.stringify(batchResponse, null, 2));

    const batchTask = batchResponse?.result?.[`task_${taskId}`]?.task ||
                     batchResponse?.result?.[`task_${taskId}`];

    if (batchTask) {
      console.log('\n🏷️ Теги из batch API:');
      console.log({
        tags: batchTask.tags || batchTask.TAGS,
        tags_type: typeof (batchTask.tags || batchTask.TAGS),
      });
    }

    // 6. Проверяем через enrichTasksData
    console.log('\n🔄 Проверяем обогащение через TaskService...');
    const enrichedTasks = await (taskService as any).enrichTasksData([task]);

    console.log('\n✨ Обогащённая задача:');
    console.log({
      ID: enrichedTasks[0]?.ID,
      TITLE: enrichedTasks[0]?.TITLE,
      TAGS: enrichedTasks[0]?.TAGS,
      TAGS_length: Array.isArray(enrichedTasks[0]?.TAGS) ? enrichedTasks[0].TAGS.length : 0,
    });

    if (Array.isArray(enrichedTasks[0]?.TAGS)) {
      console.log('\n🏷️ Финальные теги после обогащения:');
      enrichedTasks[0].TAGS.forEach((tag: string, idx: number) => {
        console.log(`  ${idx + 1}. "${tag}"`);
      });
    }

    console.log('\n✅ Тест завершён\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Запуск
const taskId = process.argv[2] || '39744';
testTaskTags(taskId);
