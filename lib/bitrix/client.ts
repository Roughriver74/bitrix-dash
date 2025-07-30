import { BitrixConfig } from './types';

export class BitrixClient {
  private baseUrl: string;
  
  constructor(webhookUrl: string) {
    this.baseUrl = webhookUrl;
  }

  async call<T = any>(method: string, params: any = {}): Promise<T> {
    const url = `${this.baseUrl}${method}.json`;
    
    console.log(`🌐 API call: ${method}`);
    const startTime = Date.now();
    
    // Создаем AbortController для таймаута
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const responseTime = Date.now() - startTime;
      console.log(`   ⏱️ Ответ получен за ${responseTime}мс`);

      if (!response.ok) {
        throw new Error(`Bitrix API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error_description || 'Unknown error');
      }

      return data.result;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`   ❌ Таймаут запроса ${method} после 30 секунд`);
        throw new Error(`Запрос ${method} превысил таймаут в 30 секунд`);
      }
      
      console.error(`   ❌ Ошибка при вызове ${method}:`, error);
      throw error;
    }
  }

  async batch(commands: Record<string, any>): Promise<any> {
    return this.call('batch', {
      cmd: commands
    });
  }

  async getAll<T = any>(method: string, params: any = {}): Promise<T[]> {
    const allResults: T[] = [];
    let hasMore = true;
    let start = 0;
    const batchSize = 50;
    
    console.log(`🔄 getAll начало для метода: ${method}`);
    
    // Используем простую пагинацию с start = -1 для ускорения
    while (hasMore) {
      const response = await this.call<any>(method, {
        ...params,
        start: start === 0 ? 0 : -1, // Первый запрос с 0, остальные с -1
        limit: batchSize
      });

      let items: T[] = [];
      if (Array.isArray(response)) {
        items = response;
      } else if (response.tasks) {
        items = response.tasks;
      } else if (response.items) {
        items = response.items;
      } else if (response.result) {
        items = Array.isArray(response.result) ? response.result : [];
      }
      
      allResults.push(...items);
      console.log(`   📦 Получено ${items.length} элементов, всего: ${allResults.length}`);
      
      // Проверяем, есть ли еще данные
      hasMore = items.length === batchSize;
      start += batchSize;
      
      // Защита от бесконечного цикла
      if (allResults.length > 10000) {
        console.warn('⚠️ Получено более 10000 элементов, прерываем');
        break;
      }
    }
    
    console.log(`✅ getAll завершено, всего элементов: ${allResults.length}`);
    return allResults;
  }

  async getAllTasks(filter: any = {}, select: string[] = ['*']): Promise<any[]> {
    const allTasks: any[] = [];
    let hasMore = true;
    let lastId = 0;
    let iteration = 0;
    const maxIterations = 100; // Защита от бесконечного цикла
    
    console.log('🔍 getAllTasks начало, фильтр:', JSON.stringify(filter));
    
    while (hasMore && iteration < maxIterations) {
      iteration++;
      console.log(`   📄 Итерация ${iteration}, lastId: ${lastId}`);
      
      const iterationStart = Date.now();
      
      // Используем стратегию "ID filter" с start = -1 для отключения подсчета общего количества
      const params: any = {
        filter: {
          ...filter
        },
        select,
        order: { ID: 'ASC' },
        limit: 50,
        start: -1  // Отключаем подсчет total для ускорения
      };
      
      // Добавляем фильтр по ID только если это не первая итерация
      if (lastId > 0) {
        params.filter['>ID'] = lastId;
      }
      
      const tasks = await this.call<any>('tasks.task.list', params);

      const tasksList = tasks.tasks || [];
      console.log(`   ✅ Получено ${tasksList.length} задач за ${Date.now() - iterationStart}мс`);
      
      if (tasksList.length === 0) {
        hasMore = false;
        console.log('   🏁 Больше задач нет');
      } else {
        // Добавим отладку структуры первой задачи
        if (iteration === 1 && tasksList.length > 0) {
          console.log('   🔍 Структура первой задачи:', Object.keys(tasksList[0]));
        }
        
        allTasks.push(...tasksList);
        // Попробуем разные варианты поля ID
        const lastTask = tasksList[tasksList.length - 1];
        const taskId = lastTask.ID || lastTask.id || lastTask.Id;
        
        if (!taskId) {
          console.error('   ❌ Не удалось получить ID из задачи:', lastTask);
          hasMore = false;
          break;
        }
        
        // Преобразуем ID в число
        lastId = parseInt(taskId, 10);
        console.log(`   📊 Всего загружено: ${allTasks.length}, новый lastId: ${lastId}`);
        
        hasMore = tasksList.length === 50;
        if (!hasMore) {
          console.log('   🏁 Получено меньше 50 задач, завершаем');
        }
      }
    }
    
    if (iteration >= maxIterations) {
      console.warn(`⚠️ Достигнут лимит итераций (${maxIterations}), возможно есть проблема`);
    }
    
    console.log(`✅ getAllTasks завершено, всего задач: ${allTasks.length}`);
    return allTasks;
  }
}