import { BitrixConfig } from './types';

export class BitrixClient {
  private baseUrl: string;
  
  constructor(webhookUrl: string) {
    this.baseUrl = webhookUrl;
  }

  async call<T = any>(method: string, params: any = {}, options: { silent?: boolean } = {}): Promise<T> {
    const url = `${this.baseUrl}${method}.json`;

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
        throw new Error(`Запрос ${method} превысил таймаут в 30 секунд`);
      }

      // Логируем ошибку только если не включен silent режим
      if (!options.silent) {
        console.error(`❌ Ошибка при вызове ${method}:`, error);
      }
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
      
      // Проверяем, есть ли еще данные
      hasMore = items.length === batchSize;
      start += batchSize;
      
      // Защита от бесконечного цикла
      if (allResults.length > 10000) {
        console.warn('⚠️ Получено более 10000 элементов, прерываем');
        break;
      }
    }
    
    return allResults;
  }

  async getAllTasks(filter: any = {}, select: string[] = ['*']): Promise<any[]> {
    console.log(`🔍 BitrixClient.getAllTasks вызван с фильтром:`, JSON.stringify(filter, null, 2));
    console.log(`📋 Запрашиваемые поля:`, select);
    
    const allTasks: any[] = [];
    let hasMore = true;
    let lastId = 0;
    let iteration = 0;
    const maxIterations = 100; // Защита от бесконечного цикла
    
    while (hasMore && iteration < maxIterations) {
      iteration++;
      
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
      
      // Проверяем структуру ответа
      if (!tasks) {
        console.warn(`⚠️ Итерация ${iteration}: ответ от Bitrix пуст`);
        hasMore = false;
        break;
      }
      
      const tasksList = tasks.tasks || tasks.result?.tasks || tasks.result || [];
      
      if (!Array.isArray(tasksList)) {
        console.error(`❌ Итерация ${iteration}: ответ не является массивом:`, typeof tasksList, tasks);
        hasMore = false;
        break;
      }
      
      if (tasksList.length === 0) {
        console.log(`📭 Итерация ${iteration}: задач не найдено, завершаем`);
        hasMore = false;
      } else {
        console.log(`📦 Итерация ${iteration}: получено ${tasksList.length} задач`);

        // Разворачиваем задачи и нормализуем поля (lowercase → UPPERCASE)
        const unwrappedTasks = tasksList.map((item: any) => {
          // Если задача обёрнута в поле 'task', извлекаем её
          let task = item;
          if (item.task && typeof item.task === 'object') {
            task = item.task;
          }

          // Нормализуем поля: Bitrix возвращает lowercase, а код ожидает UPPERCASE
          return {
            ...task,
            ID: task.ID || task.id,
            TITLE: task.TITLE || task.title,
            DESCRIPTION: task.DESCRIPTION || task.description,
            STATUS: task.STATUS || task.status,
            REAL_STATUS: task.REAL_STATUS || task.realStatus,
            RESPONSIBLE_ID: task.RESPONSIBLE_ID || task.responsibleId,
            CREATED_BY: task.CREATED_BY || task.createdBy,
            CREATED_DATE: task.CREATED_DATE || task.createdDate,
            CHANGED_DATE: task.CHANGED_DATE || task.changedDate,
            CLOSED_DATE: task.CLOSED_DATE || task.closedDate,
            DEADLINE: task.DEADLINE || task.deadline,
            PRIORITY: task.PRIORITY || task.priority,
            GROUP_ID: task.GROUP_ID || task.groupId,
            TAGS: task.TAGS || task.tags,
            UF_CRM_TASK: task.UF_CRM_TASK || task.ufCrmTask,
            STAGE_ID: task.STAGE_ID || task.stageId
          };
        });

        allTasks.push(...unwrappedTasks);

        // Попробуем разные варианты поля ID
        const lastTask = unwrappedTasks[unwrappedTasks.length - 1];
        const taskId = lastTask.ID || lastTask.id || lastTask.Id;
        
        if (!taskId) {
          console.error('❌ Не удалось получить ID из задачи:', lastTask);
          hasMore = false;
          break;
        }
        
        // Преобразуем ID в число
        lastId = parseInt(taskId, 10);
        
        hasMore = tasksList.length === 50;
      }
    }
    
    if (iteration >= maxIterations) {
      console.warn(`⚠️ Достигнут лимит итераций (${maxIterations}), возможно есть проблема`);
    }
    
    console.log(`✅ BitrixClient.getAllTasks: всего получено ${allTasks.length} задач`);
    
    return allTasks;
  }
}