import { BitrixClient } from '../client';
import { BitrixTask } from '../types';
import { TaskMetadata, mergeTagsWithMetadata } from '@/lib/tasks/metadata';
import { cache } from '@/lib/cache';

export class TaskService {
  constructor(private client: BitrixClient) {}
  
  // TTL для кеша тегов задач (1 час)
  private readonly TASK_TAGS_CACHE_TTL = 3600;

  async getAllTasks(userIds: string[]): Promise<{ activeTasks: BitrixTask[], completedTasks: BitrixTask[] }> {
    if (userIds.length === 0) {
      return { activeTasks: [], completedTasks: [] };
    }
    
    // Дата для фильтрации завершенных задач (последние 30 дней)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const userChunks = this.chunkArray(userIds, 10);
    const allActiveTasks: BitrixTask[] = [];
    const allCompletedTasks: BitrixTask[] = [];
    
    for (const [index, chunk] of userChunks.entries()) {
      try {
        // Получаем активные задачи (исключаем завершенные и отложенные)
        // Явно указываем поля, которые нужно получить, включая TAGS
        const activeTasks = await this.client.getAllTasks(
          {
            RESPONSIBLE_ID: chunk,
            '!STATUS': [5, 6] // Исключаем завершенные (5) и отложенные (6)
          },
          ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'TAGS', 'UF_CRM_TASK']
        );
        allActiveTasks.push(...activeTasks);
        
        // Получаем завершенные задачи за последние 30 дней
        const completedTasks = await this.client.getAllTasks(
          {
            RESPONSIBLE_ID: chunk,
            STATUS: 5, // Только завершенные
            '>=CLOSED_DATE': thirtyDaysAgo.toISOString()
          },
          ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'TAGS', 'UF_CRM_TASK']
        );
        allCompletedTasks.push(...completedTasks);
        
      } catch (error) {
        console.error(`❌ Ошибка при получении задач для группы ${index + 1}:`, error);
        // Продолжаем с другими группами
      }
    }
    
    // Обогащаем данные для обеих групп
    const enrichedActiveTasks = await this.enrichTasksData(allActiveTasks);
    const enrichedCompletedTasks = await this.enrichTasksData(allCompletedTasks);
    
    return {
      activeTasks: enrichedActiveTasks,
      completedTasks: enrichedCompletedTasks
    };
  }

  async getAllDepartmentTasks(userIds: string[]): Promise<BitrixTask[]> {
    const { activeTasks } = await this.getAllTasks(userIds);
    return activeTasks;
  }

  async getCompletedTasks(userIds: string[], days: number = 30): Promise<BitrixTask[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    
    const userChunks = this.chunkArray(userIds, 10);
    const allTasks: BitrixTask[] = [];
    
    for (const [index, chunk] of userChunks.entries()) {
      try {
        // Получаем ВСЕ задачи (включая завершенные)
        const allUserTasks = await this.client.getAllTasks(
          {
            RESPONSIBLE_ID: chunk
          },
          ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'TAGS', 'UF_CRM_TASK']
        );
        
        // Фильтруем завершенные задачи
        const completedTasks = allUserTasks.filter((task: any) => {
          // Проверяем статус (5 = завершена)
          const status = task.STATUS || task.status;
          if (status !== '5' && status !== 5) return false;
          
          // Проверяем дату закрытия
          const closedDate = task.CLOSED_DATE || task.closedDate || task.CHANGED_DATE || task.changedDate;
          if (!closedDate) {
            return false;
          }
          
          const taskClosedDate = new Date(closedDate);
          const isInRange = taskClosedDate >= dateFrom;
          
          return isInRange;
        });
        
        allTasks.push(...completedTasks);
      } catch (error) {
        console.error(`❌ Ошибка при получении завершенных задач для группы ${index + 1}:`, error);
      }
    }
    
    // Обогащаем данные
    const enrichedTasks = await this.enrichTasksData(allTasks);
    
    return enrichedTasks;
  }

  async createTask(options: CreateTaskOptions): Promise<BitrixTask> {
    const { metadata, tags = [], ...rest } = options;

    const fields: Record<string, any> = {
      TITLE: rest.title,
      RESPONSIBLE_ID: rest.responsibleId,
    };

    if (rest.description !== undefined) {
      fields.DESCRIPTION = rest.description;
    }

    if (rest.deadline) {
      fields.DEADLINE = rest.deadline;
    }

    if (rest.priority !== undefined) {
      fields.PRIORITY = rest.priority;
    }

    if (rest.createdBy) {
      fields.CREATED_BY = rest.createdBy;
    }

    if (rest.ufCrmTask && rest.ufCrmTask.length > 0) {
      fields.UF_CRM_TASK = rest.ufCrmTask;
    }

    const finalTags = mergeTagsWithMetadata(tags, metadata);
    if (finalTags.length > 0) {
      fields.TAGS = finalTags;
    }

    const response = await this.client.call<any>('tasks.task.add', {
      fields,
      params: { RETURN_TASK: true },
    });

    const task = response?.task || response?.result?.task || response;
    const enriched = await this.enrichTasksData([task]);
    const result = enriched[0];
    
    // Сохраняем теги в кеш при создании задачи
    if (result && result.TAGS) {
      const cacheKey = `task:${result.ID}:tags`;
      await cache.setex(cacheKey, this.TASK_TAGS_CACHE_TTL, {
        TAGS: result.TAGS,
        ID: result.ID,
      });
    }
    
    return result;
  }

  async updateTask(taskId: string, options: UpdateTaskOptions): Promise<BitrixTask | null> {
    const { metadata, tags, otherTags, ...rest } = options;
    const fields: Record<string, any> = {};

    if (rest.title !== undefined) {
      fields.TITLE = rest.title;
    }

    if (rest.description !== undefined) {
      fields.DESCRIPTION = rest.description;
    }

    if (rest.responsibleId !== undefined) {
      fields.RESPONSIBLE_ID = rest.responsibleId;
    }

    if (rest.deadline !== undefined) {
      fields.DEADLINE = rest.deadline;
    }

    if (rest.priority !== undefined) {
      fields.PRIORITY = rest.priority;
    }

    if (rest.status !== undefined) {
      fields.STATUS = rest.status;
    }

    if (rest.ufCrmTask !== undefined) {
      fields.UF_CRM_TASK = rest.ufCrmTask;
    }

    // Если обновляются метаданные или теги, нужно получить текущие теги задачи
    if (metadata || tags || otherTags) {
      let baseTags: string[] = [];
      
      if (tags) {
        // Если переданы tags напрямую, используем их
        baseTags = tags;
      } else if (otherTags) {
        // Если переданы otherTags, используем их (они уже без метаданных)
        baseTags = otherTags;
      } else {
        // Если переданы только метаданные, получаем текущие теги задачи
        const currentTask = await this.client.call<any>('tasks.task.get', {
          taskId,
        });
        const currentTags = currentTask?.task?.TAGS || currentTask?.result?.task?.TAGS || [];
        baseTags = Array.isArray(currentTags) ? currentTags : [];
      }
      
      fields.TAGS = mergeTagsWithMetadata(baseTags, metadata);
    }

    if (Object.keys(fields).length === 0) {
      return null;
    }

    const response = await this.client.call<any>('tasks.task.update', {
      taskId,
      fields,
      params: { RETURN_TASK: true },
    });

    const task = response?.task || response?.result?.task;
    if (!task) {
      return null;
    }

    const enriched = await this.enrichTasksData([task]);
    const result = enriched[0] ?? null;
    
    // Обновляем кеш тегов после обновления задачи
    if (result) {
      const cacheKey = `task:${taskId}:tags`;
      const tagsToCache = result.TAGS || [];
      await cache.setex(cacheKey, this.TASK_TAGS_CACHE_TTL, {
        TAGS: tagsToCache,
        ID: taskId,
      });
    }
    
    return result;
  }

  async updateTaskTags(taskId: string, tags: string[], metadata?: TaskMetadata): Promise<void> {
    const finalTags = mergeTagsWithMetadata(tags, metadata);
    await this.client.call('tasks.task.update', {
      taskId,
      fields: {
        TAGS: finalTags,
      },
    });
    
    // Обновляем кеш тегов
    const cacheKey = `task:${taskId}:tags`;
    await cache.setex(cacheKey, this.TASK_TAGS_CACHE_TTL, {
      TAGS: finalTags,
      ID: taskId,
    });
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const result = await this.client.call<{ result: boolean }>('tasks.task.delete', {
      taskId,
    });

    return Boolean(result?.result ?? result);
  }

  async completeTask(taskId: string): Promise<boolean> {
    const result = await this.client.call<{ result: boolean }>('tasks.task.complete', {
      taskId,
    });
    return Boolean(result?.result ?? result);
  }

  /**
   * Получает полную информацию о задаче через tasks.task.get (включая теги)
   * Использует кеш для минимизации запросов к API
   * @param taskId ID задачи
   * @returns Полная информация о задаче или null при ошибке
   */
  private async getTaskWithTags(taskId: string): Promise<any | null> {
    // Проверяем кеш
    const cacheKey = `task:${taskId}:tags`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      const response = await this.client.call<any>('tasks.task.get', {
        taskId,
      });
      
      // Извлекаем задачу из ответа
      const task = response?.task || response?.result?.task || response;
      if (!task) {
        return null;
      }
      
      // Сохраняем в кеш только теги для экономии места
      const tags = task.TAGS || task.tags || [];
      await cache.setex(cacheKey, this.TASK_TAGS_CACHE_TTL, {
        TAGS: tags,
        ID: task.ID || taskId,
      });
      
      return task;
    } catch (error) {
      console.error(`❌ Ошибка при получении задачи ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Получает вес задачи из Scrum (storyPoints)
   * @param taskId ID задачи
   * @returns Вес задачи (storyPoints) или null, если задача не в Scrum или вес не задан
   */
  private async getScrumTaskWeight(taskId: string): Promise<number | null> {
    try {
      const scrumData = await this.client.call<any>('tasks.api.scrum.task.get', {
        taskId,
      });
      
      // Проверяем различные варианты структуры ответа
      const storyPoints = scrumData?.storyPoints 
        || scrumData?.result?.storyPoints 
        || scrumData?.task?.storyPoints
        || scrumData?.data?.storyPoints;
      
      if (storyPoints !== undefined && storyPoints !== null) {
        const weight = Number(storyPoints);
        if (Number.isFinite(weight) && weight >= 0) {
          return weight;
        }
      }
      
      return null;
    } catch (error) {
      // Если задача не в Scrum или произошла ошибка, возвращаем null
      // Не логируем ошибку, так как это нормально для обычных задач
      return null;
    }
  }

  private async enrichTasksData(tasks: BitrixTask[]): Promise<BitrixTask[]> {
    const enrichedTasks: BitrixTask[] = [];
    const now = new Date();
    
    // Сначала проверяем, какие задачи нуждаются в получении тегов
    // tasks.task.list не возвращает теги, поэтому нужно получать их через tasks.task.get
    const tasksNeedingTags = new Map<string, any>();
    const scrumWeightsMap = new Map<string, number | null>();
    
    // Проверяем задачи на наличие тегов
    for (const task of tasks) {
      const taskAny = task as any;
      const taskId = taskAny.id || taskAny.ID;
      if (!taskId) continue;
      
      // Проверяем, есть ли теги в задаче
      const hasTags = taskAny.TAGS && Array.isArray(taskAny.TAGS) && taskAny.TAGS.length > 0;
      
      // Если тегов нет, добавляем в очередь для получения через tasks.task.get
      if (!hasTags) {
        tasksNeedingTags.set(taskId, taskAny);
      }
    }
    
    // Получаем теги для задач, которым они нужны (батчами по 10)
    const batchSize = 10;
    const taskIdsNeedingTags = Array.from(tasksNeedingTags.keys());
    
    if (taskIdsNeedingTags.length > 0) {
      console.log(`📋 Получаем теги для ${taskIdsNeedingTags.length} задач через tasks.task.get (батчами по ${batchSize})`);
      
      for (let i = 0; i < taskIdsNeedingTags.length; i += batchSize) {
        const batch = taskIdsNeedingTags.slice(i, i + batchSize);
        const batchPromises = batch.map(async (taskId) => {
          const taskWithTags = await this.getTaskWithTags(taskId);
          if (taskWithTags && taskWithTags.TAGS) {
            // Обновляем задачу тегами из кеша/API
            const originalTask = tasksNeedingTags.get(taskId);
            if (originalTask) {
              originalTask.TAGS = taskWithTags.TAGS;
            }
          }
        });
        
        // Ждем завершения текущего батча перед следующим
        await Promise.allSettled(batchPromises);
      }
      
      console.log(`✅ Теги получены для ${taskIdsNeedingTags.length} задач`);
    }
    
    // Получаем Scrum-веса для задач, которые могут быть в Scrum
    // Ограничиваем количество параллельных запросов до 10 для избежания перегрузки API
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (task) => {
        const taskAny = task as any;
        const taskId = taskAny.id || taskAny.ID;
        // Пробуем получить вес из Scrum для всех задач
        // Если задача не в Scrum, метод вернет null без ошибки
        if (taskId) {
          const weight = await this.getScrumTaskWeight(taskId);
          if (weight !== null) {
            scrumWeightsMap.set(taskId, weight);
          }
        }
      });
      
      // Ждем завершения текущего батча перед следующим
      await Promise.allSettled(batchPromises);
    }
    
    // Быстрое обогащение без истории - используем только CHANGED_DATE
    for (const task of tasks) {
      // Маппинг полей из camelCase в UPPER_CASE для совместимости
      const taskAny = task as any;
      
      // Обработка тегов - они могут приходить в разных форматах из Bitrix API
      let tags: string[] = [];
      
      // Bitrix API может возвращать теги в разных местах и форматах
      // Проверяем различные варианты структуры ответа
      let tagsSource: any = null;
      
      // Вариант 1: Прямое поле TAGS
      if (taskAny.TAGS !== undefined) {
        tagsSource = taskAny.TAGS;
      }
      // Вариант 2: Поле tags (camelCase)
      else if (taskAny.tags !== undefined) {
        tagsSource = taskAny.tags;
      }
      // Вариант 3: Вложенная структура (если задача приходит как объект с полем task)
      else if (taskAny.task?.TAGS !== undefined) {
        tagsSource = taskAny.task.TAGS;
      }
      else if (taskAny.task?.tags !== undefined) {
        tagsSource = taskAny.task.tags;
      }
      
      if (tagsSource) {
        if (Array.isArray(tagsSource)) {
          // Если это массив, обрабатываем каждый элемент
          tags = tagsSource
            .map((tag: any) => {
              // Если тег - объект, извлекаем значение
              if (typeof tag === 'object' && tag !== null) {
                return tag.NAME || tag.name || tag.VALUE || tag.value || tag.TITLE || tag.title || String(tag);
              }
              // Если тег - строка, используем её
              return String(tag).trim();
            })
            .filter((tag: string) => tag && tag.length > 0);
        } else if (typeof tagsSource === 'string') {
          // Если теги приходят как строка, разделяем по запятой
          tags = tagsSource.split(',').map((t: string) => t.trim()).filter(Boolean);
        }
      }
      
      const taskId = taskAny.id || taskAny.ID;
      
      // Если теги все еще пустые после попытки получить через tasks.task.get,
      // проверяем кеш еще раз (на случай если они были получены в другом батче)
      if (tags.length === 0 && taskId) {
        const cacheKey = `task:${taskId}:tags`;
        const cached = await cache.get(cacheKey);
        if (cached && cached.TAGS && Array.isArray(cached.TAGS) && cached.TAGS.length > 0) {
          tags = cached.TAGS;
        }
      }
      
      // Проверяем, есть ли вес из Scrum для этой задачи
      const scrumWeight = scrumWeightsMap.get(taskId);
      
      // Если есть вес из Scrum и его еще нет в тегах, добавляем его
      if (scrumWeight !== undefined && scrumWeight !== null) {
        // Проверяем, есть ли уже вес в тегах
        const hasWeightInTags = tags.some(tag => {
          const lowerTag = String(tag).toLowerCase().trim();
          return lowerTag.startsWith('weight:');
        });
        
        // Если веса в тегах нет, добавляем его
        if (!hasWeightInTags) {
          tags.push(`weight:${scrumWeight}`);
        }
      }
      
      const mappedTask: BitrixTask = {
        ID: taskId,
        TITLE: taskAny.title || taskAny.TITLE || 'Без названия',
        DESCRIPTION: taskAny.description || taskAny.DESCRIPTION,
        RESPONSIBLE_ID: taskAny.responsibleId || taskAny.RESPONSIBLE_ID,
        RESPONSIBLE_NAME: taskAny.responsible?.NAME 
          ? `${taskAny.responsible.NAME} ${taskAny.responsible.LAST_NAME || ''}`
          : undefined,
        CREATED_BY: taskAny.createdBy || taskAny.CREATED_BY,
        CREATED_DATE: taskAny.createdDate || taskAny.CREATED_DATE,
        CHANGED_DATE: taskAny.changedDate || taskAny.CHANGED_DATE,
        CLOSED_DATE: taskAny.closedDate || taskAny.CLOSED_DATE,
        DEADLINE: taskAny.deadline || taskAny.DEADLINE,
        STATUS: taskAny.status || taskAny.STATUS,
        PRIORITY: taskAny.priority || taskAny.PRIORITY,
        GROUP_ID: taskAny.groupId || taskAny.GROUP_ID,
        TAGS: tags,
        UF_CRM_TASK: taskAny.ufCrmTask || taskAny.UF_CRM_TASK
      };
      
      // Используем CHANGED_DATE для определения последней активности
      const lastActivity = mappedTask.CHANGED_DATE || mappedTask.CREATED_DATE;
      const lastActivityDate = new Date(lastActivity);
      const inactiveDays = Math.floor(
        (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Определяем, находится ли задача в работе (STATUS = '3')
      const isInProgress = mappedTask.STATUS === '3' || String(mappedTask.STATUS) === '3';
      let executionTime = 0;
      let executionStartDate: string | undefined;
      
      if (isInProgress) {
        // Для задач в работе считаем время выполнения от даты изменения статуса
        // В упрощенном варианте используем CHANGED_DATE
        executionStartDate = mappedTask.CHANGED_DATE || mappedTask.CREATED_DATE;
        const startDate = new Date(executionStartDate);
        executionTime = Math.floor(
          (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
      
      enrichedTasks.push({
        ...mappedTask,
        lastActivity,
        inactiveDays,
        isOverdue: !!mappedTask.DEADLINE && new Date(mappedTask.DEADLINE) < now,
        priority: this.getPriorityLevel(mappedTask, inactiveDays),
        isInProgress,
        executionTime,
        executionStartDate
      });
    }
    
    // Если нужна детальная история, можно запросить ее позже только для видимых задач
    return enrichedTasks;
  }

  private getPriorityLevel(task: BitrixTask, inactiveDays: number): 'normal' | 'warning' | 'critical' {
    if (task.isOverdue || inactiveDays >= 7) return 'critical';
    if (inactiveDays >= 3) return 'warning';
    return 'normal';
  }

  // Отсутствия временно отключены - API методы недоступны в текущей конфигурации Bitrix24
  async getAbsenceEvents(userIds: string[]): Promise<Record<string, any>> {
    // Возвращаем пустую информацию об отсутствиях
    const absenceInfo: Record<string, any> = {};
    for (const userId of userIds) {
      absenceInfo[userId] = {
        userId,
        isAbsent: false
      };
    }
    
    return absenceInfo;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private chunkObject(obj: Record<string, any>, size: number): Record<string, any>[] {
    const entries = Object.entries(obj);
    const chunks: Record<string, any>[] = [];
    
    for (let i = 0; i < entries.length; i += size) {
      const chunk = entries.slice(i, i + size);
      chunks.push(Object.fromEntries(chunk));
    }
    
    return chunks;
  }
}

export interface CreateTaskOptions {
  title: string;
  responsibleId: string;
  description?: string;
  deadline?: string;
  priority?: number;
  createdBy?: string;
  ufCrmTask?: string[];
  tags?: string[];
  metadata?: TaskMetadata;
}

export interface UpdateTaskOptions {
  title?: string;
  description?: string;
  responsibleId?: string;
  deadline?: string;
  priority?: number;
  status?: string;
  ufCrmTask?: string[];
  tags?: string[];
  otherTags?: string[];
  metadata?: TaskMetadata;
}