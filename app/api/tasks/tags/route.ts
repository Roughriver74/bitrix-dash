import { NextResponse } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { TaskService } from '@/lib/bitrix/services/TaskService';
import { getConfiguredWebhookUrl } from '@/lib/config';

/**
 * GET /api/tasks/tags?id=123,456,789
 * Получает теги для указанных задач через tasks.task.get
 * Используется для ленивой загрузки тегов после первоначальной загрузки страницы
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskIdsParam = searchParams.get('id');
    
    if (!taskIdsParam) {
      return NextResponse.json(
        { error: 'Параметр id обязателен (можно указать несколько через запятую)' },
        { status: 400 },
      );
    }
    
    const taskIds = taskIdsParam.split(',').map(id => id.trim()).filter(Boolean);
    
    if (taskIds.length === 0) {
      return NextResponse.json({ error: 'Не указаны ID задач' }, { status: 400 });
    }
    
    // Ограничиваем количество задач за один запрос
    if (taskIds.length > 20) {
      return NextResponse.json(
        { error: 'Максимум 20 задач за один запрос' },
        { status: 400 },
      );
    }
    
    const webhookUrl = await getConfiguredWebhookUrl();
    const client = new BitrixClient(webhookUrl);
    const taskService = new TaskService(client);
    
    // Получаем теги для задач батчами
    const batchSize = 10;
    const tasksWithTags: Record<string, string[]> = {};
    
    for (let i = 0; i < taskIds.length; i += batchSize) {
      const batch = taskIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (taskId) => {
        const taskWithTags = await taskService.getTaskWithTags(taskId);
        if (taskWithTags && taskWithTags.TAGS) {
          tasksWithTags[taskId] = Array.isArray(taskWithTags.TAGS)
            ? taskWithTags.TAGS
            : [];
        } else {
          tasksWithTags[taskId] = [];
        }
      });
      
      await Promise.allSettled(batchPromises);
    }
    
    return NextResponse.json({ tasks: tasksWithTags });
  } catch (error) {
    console.error('❌ Tasks tags GET error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось получить теги задач',
      },
      { status: 500 },
    );
  }
}

