import { BitrixClient } from '../client';
import { BitrixTask } from '../types';
import { TaskMetadata, mergeTagsWithMetadata } from '@/lib/tasks/metadata';
import { cache } from '@/lib/cache';
import { normalizeSystemName } from '@/lib/tasks/systems';

export class TaskService {
  constructor(private client: BitrixClient) {}

  // TTL для кеша тегов задач (1 час)
  private readonly TASK_TAGS_CACHE_TTL = 3600;

  // TTL для кеша Scrum весов (2 часа - веса меняются редко)
  private readonly SCRUM_WEIGHT_CACHE_TTL = 7200;

  // Флаг для включения/выключения загрузки Scrum весов
  // По умолчанию отключено для ускорения загрузки задач
  // Включите через LOAD_SCRUM_WEIGHTS=true, если используете Scrum
  private readonly LOAD_SCRUM_WEIGHTS = process.env.LOAD_SCRUM_WEIGHTS === 'true';

  async getAllTasks(userIds: string[]): Promise<{ activeTasks: BitrixTask[], completedTasks: BitrixTask[] }> {
    console.log(`🔍 getAllTasks вызван для ${userIds.length} пользователей`);
    
    if (userIds.length === 0) {
      console.warn('⚠️ Список пользователей пуст');
      return { activeTasks: [], completedTasks: [] };
    }
    
    // Дата для фильтрации завершенных задач (последние 30 дней)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const userChunks = this.chunkArray(userIds, 10);
    console.log(`📦 Разбито на ${userChunks.length} чанков по 10 пользователей`);
    
    const allActiveTasks: BitrixTask[] = [];
    const allCompletedTasks: BitrixTask[] = [];
    const taskIdsFromBitrix: string[] = [];
    
    for (const [index, chunk] of userChunks.entries()) {
      try {
        // Получаем активные задачи (исключаем завершенные и отложенные)
        // НЕ запрашиваем TAGS - они не приходят через tasks.task.list
        console.log(`🔍 Запрашиваем активные задачи для чанка ${index + 1} (${chunk.length} пользователей)`);
        
        // Пробуем получить все задачи для пользователей, потом отфильтруем на нашей стороне
        // Фильтр !STATUS может не работать в Bitrix API
        const activeTasksRaw = await this.client.getAllTasks(
          {
            RESPONSIBLE_ID: chunk,
          },
          ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'UF_CRM_TASK']
        );
        
        // Фильтруем активные задачи на нашей стороне (исключаем завершенные (5) и отложенные (6))
        const activeTasks = activeTasksRaw.filter((task: any) => {
          const status = String(task.STATUS || task.status || '');
          return status !== '5' && status !== '6';
        });
        
        console.log(`📋 Чанк ${index + 1}: получено ${activeTasks.length} активных задач из Bitrix`);

        if (activeTasks.length > 0) {
          console.log(`📋 Пример первой задачи:`, {
            ID: activeTasks[0].ID,
            TITLE: activeTasks[0].TITLE?.substring(0, 50),
            STATUS: activeTasks[0].STATUS,
            RESPONSIBLE_ID: activeTasks[0].RESPONSIBLE_ID,
          });
        }

        // Добавляем задачи без дедупликации (дедупликация будет в конце)
        allActiveTasks.push(...activeTasks);
        taskIdsFromBitrix.push(...activeTasks.map(t => t.ID).filter(Boolean));
        
        // Получаем завершенные задачи за последние 30 дней
        console.log(`🔍 Запрашиваем завершенные задачи для чанка ${index + 1} (с ${thirtyDaysAgo.toISOString()})`);
        
        const completedTasks = await this.client.getAllTasks(
          {
            RESPONSIBLE_ID: chunk,
            STATUS: 5, // Только завершенные
            '>=CLOSED_DATE': thirtyDaysAgo.toISOString()
          },
          ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'UF_CRM_TASK']
        );
        
        console.log(`📋 Чанк ${index + 1}: получено ${completedTasks.length} завершенных задач из Bitrix`);

        // Добавляем задачи без дедупликации (дедупликация будет в конце)
        allCompletedTasks.push(...completedTasks);
        taskIdsFromBitrix.push(...completedTasks.map(t => t.ID).filter(Boolean));
        
      } catch (error) {
        console.error(`❌ Ошибка при получении задач для группы ${index + 1}:`, error);
        // Продолжаем с другими группами
      }
    }
    
    // Финальная дедупликация по всем задачам (единственная дедупликация)
    console.log(`🔄 Дедупликация: было ${allActiveTasks.length} активных и ${allCompletedTasks.length} завершенных задач`);

    const deduplicatedActiveTasks = Array.from(
      new Map(allActiveTasks.filter(t => t.ID).map(t => [t.ID, t])).values()
    );

    const deduplicatedCompletedTasks = Array.from(
      new Map(allCompletedTasks.filter(t => t.ID).map(t => [t.ID, t])).values()
    );

    console.log(`✅ После дедупликации: ${deduplicatedActiveTasks.length} активных и ${deduplicatedCompletedTasks.length} завершенных уникальных задач`);

    console.log(`🔄 Начинаем обогащение данных: ${deduplicatedActiveTasks.length} активных, ${deduplicatedCompletedTasks.length} завершенных`);

    // Обогащаем данные для обеих групп
    const enrichedActiveTasks = await this.enrichTasksData(deduplicatedActiveTasks);
    console.log(`✅ Обогащено ${enrichedActiveTasks.length} активных задач`);

    const enrichedCompletedTasks = await this.enrichTasksData(deduplicatedCompletedTasks);
    console.log(`✅ Обогащено ${enrichedCompletedTasks.length} завершенных задач`);
    
    console.log(`🎯 Итого возвращаем: ${enrichedActiveTasks.length} активных, ${enrichedCompletedTasks.length} завершенных`);
    
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
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const result = await this.client.call<{ result: boolean }>('tasks.task.delete', {
      taskId,
    });

    const deleted = Boolean(result?.result ?? result);

    return deleted;
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
  async getTaskWithTags(taskId: string): Promise<any | null> {
    // Проверяем кеш
    const cacheKey = `task:${taskId}:tags`;
    const cached = await cache.get(cacheKey);
    if (cached && cached.TAGS) {
      return {
        TAGS: cached.TAGS,
        ID: cached.ID || taskId,
      };
    }

    // Если нет в кеше - запрашиваем из Bitrix
    try {
      const response = await this.client.call<any>('tasks.task.get', {
        taskId,
      });

      // Извлекаем задачу из ответа
      const task = response?.task || response?.result?.task || response;
      if (!task) {
        return null;
      }

      // Извлекаем теги
      const tags = task.TAGS || task.tags || [];

      // Сохраняем в кеш
      await cache.setex(cacheKey, this.TASK_TAGS_CACHE_TTL, {
        TAGS: tags,
        ID: task.ID || taskId,
      });

      // Возвращаем структуру с тегами
      return {
        TAGS: tags,
        ID: task.ID || taskId,
      };
    } catch (error) {
      console.error(`❌ Ошибка при получении задачи ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Загружает теги для списка задач через batch API
   * @param tasks Список задач
   * @returns Map с тегами по ID задачи
   */
  private async loadTaskTagsBatch(tasks: BitrixTask[]): Promise<Map<string, string[]>> {
    const tagsMap = new Map<string, string[]>();

    if (tasks.length === 0) {
      return tagsMap;
    }

    // Batch API принимает максимум 50 команд за раз
    const batchSize = 50;
    const taskChunks: BitrixTask[][] = [];

    for (let i = 0; i < tasks.length; i += batchSize) {
      taskChunks.push(tasks.slice(i, i + batchSize));
    }

    console.log(`📦 Загрузка тегов через batch API: ${taskChunks.length} батчей по ${batchSize} задач`);

    for (const [chunkIndex, chunk] of taskChunks.entries()) {
      try {
        // Формируем команды для batch запроса
        const commands: Record<string, string> = {};

        chunk.forEach((task: any) => {
          const taskId = task.ID || task.id;
          if (taskId) {
            // Используем tasks.task.get для получения полной информации включая теги
            commands[`task_${taskId}`] = `tasks.task.get?taskId=${taskId}&select[]=TAGS`;
          }
        });

        if (Object.keys(commands).length === 0) {
          continue;
        }

        console.log(`🔄 Batch ${chunkIndex + 1}/${taskChunks.length}: запрос ${Object.keys(commands).length} задач`);

        const batchResults = await this.client.batch(commands);

        // Обрабатываем результаты
        for (const [key, result] of Object.entries(batchResults.result || {})) {
          try {
            const taskData = (result as any)?.task || (result as any);
            if (taskData) {
              const taskId = taskData.id || taskData.ID;
              let tags: string[] = [];

              // Извлекаем теги из различных возможных мест
              // Bitrix возвращает теги в формате: { "507": { "id": 507, "title": "abc:A" } }
              let rawTags: any[] = [];

              if (Array.isArray(taskData.tags)) {
                rawTags = taskData.tags;
              } else if (Array.isArray(taskData.TAGS)) {
                rawTags = taskData.TAGS;
              } else if (taskData.tags && typeof taskData.tags === 'object') {
                rawTags = Object.values(taskData.tags);
              } else if (taskData.TAGS && typeof taskData.TAGS === 'object') {
                rawTags = Object.values(taskData.TAGS);
              }

              // Нормализуем теги - извлекаем title из объектов или конвертируем в строки
              tags = rawTags
                .map(t => {
                  // Если тег - объект с полем title (формат Bitrix: {id: 507, title: "abc:A"})
                  if (t && typeof t === 'object' && t.title) {
                    return String(t.title).trim();
                  }
                  // Если тег - примитивное значение (строка или число)
                  const type = typeof t;
                  if ((type === 'string' || type === 'number') && t !== null && t !== undefined) {
                    return String(t).trim();
                  }
                  return null;
                })
                .filter((t): t is string => t !== null && t.length > 0);

              if (taskId && tags.length > 0) {
                tagsMap.set(String(taskId), tags);

                // Сохраняем в кеш для будущих запросов
                const cacheKey = `task:${taskId}:tags`;
                await cache.setex(cacheKey, this.TASK_TAGS_CACHE_TTL, {
                  TAGS: tags,
                  ID: taskId,
                }).catch(() => {}); // Игнорируем ошибки кеша
              }
            }
          } catch (err) {
            // Игнорируем ошибки парсинга отдельных задач
            console.warn(`⚠️ Ошибка обработки результата для ${key}:`, err);
          }
        }

        console.log(`✅ Batch ${chunkIndex + 1}/${taskChunks.length}: загружено тегов для ${Object.keys(batchResults.result || {}).length} задач`);

      } catch (error) {
        console.error(`❌ Ошибка при загрузке batch ${chunkIndex + 1}:`, error);
        // Продолжаем со следующим батчем
      }
    }

    return tagsMap;
  }

  /**
   * Получает вес задачи из Scrum (storyPoints) с кешированием
   * @param taskId ID задачи
   * @returns Вес задачи (storyPoints) или null, если задача не в Scrum или вес не задан
   */
  private async getScrumTaskWeight(taskId: string): Promise<number | null> {
    // Проверяем кеш
    const cacheKey = `scrum:weight:${taskId}`;
    const cached = await cache.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached as number | null;
    }

    try {
      // ВАЖНО: параметр должен быть "id", а не "taskId"!
      const scrumData = await this.client.call<any>('tasks.api.scrum.task.get', {
        id: taskId,
      }, { silent: true });

      console.log(`🔍 Scrum task ${taskId} data:`, JSON.stringify(scrumData).substring(0, 300));

      // API возвращает данные напрямую: { storyPoints: "", epicId: 9, ... }
      const storyPoints = scrumData?.storyPoints;

      let weight: number | null = null;

      // storyPoints может быть пустой строкой - это валидно
      if (storyPoints !== undefined && storyPoints !== null && storyPoints !== '') {
        const parsed = Number(storyPoints);
        if (Number.isFinite(parsed) && parsed >= 0) {
          weight = parsed;
          console.log(`✅ Scrum task ${taskId} weight: ${weight}`);
        }
      } else {
        console.log(`⚠️ Scrum task ${taskId}: no story points (empty or not set)`);
      }

      // Кешируем результат (даже если null - чтобы не делать лишние запросов)
      await cache.setex(cacheKey, this.SCRUM_WEIGHT_CACHE_TTL, weight);

      return weight;
    } catch (error) {
      console.error(`❌ Error loading Scrum data for task ${taskId}:`, error);
      // Если задача не в Scrum или произошла ошибка, кешируем null
      await cache.setex(cacheKey, this.SCRUM_WEIGHT_CACHE_TTL, null);
      return null;
    }
  }

  /**
   * Получает название Epic для Scrum задачи с кешированием
   * @param taskId ID задачи
   * @returns Название Epic или null
   */
  private async getScrumTaskEpic(taskId: string): Promise<string | null> {
    const cacheKey = `scrum:epic:${taskId}`;
    const cached = await cache.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached as string | null;
    }

    try {
      // ВАЖНО: параметр должен быть "id", а не "taskId"!
      const scrumData = await this.client.call<any>('tasks.api.scrum.task.get', {
        id: taskId,
      }, { silent: true });

      console.log(`🔍 Scrum task ${taskId} epic data:`, JSON.stringify(scrumData).substring(0, 300));

      // API возвращает данные напрямую: { epicId: 9, ... }
      const epicId = scrumData?.epicId;

      if (!epicId) {
        console.log(`⚠️ Scrum task ${taskId}: no epicId found`);
        await cache.setex(cacheKey, this.SCRUM_WEIGHT_CACHE_TTL, null);
        return null;
      }

      // Получаем название эпика по ID
      console.log(`📌 Loading epic ${epicId} for task ${taskId}...`);
      const epicData = await this.client.call<any>('tasks.api.scrum.epic.get', {
        id: epicId,
      }, { silent: true });

      console.log(`🔍 Epic ${epicId} data:`, JSON.stringify(epicData).substring(0, 300));

      // Пробуем получить название эпика из разных мест в ответе
      const epicName = epicData?.result?.name
        || epicData?.result?.NAME
        || epicData?.name
        || epicData?.NAME
        || null;

      if (epicName) {
        const name = String(epicName).trim();
        console.log(`✅ Epic ${epicId} name: ${name}`);
        await cache.setex(cacheKey, this.SCRUM_WEIGHT_CACHE_TTL, name);
        return name;
      } else {
        console.log(`⚠️ Epic ${epicId}: no name found in response`);
        await cache.setex(cacheKey, this.SCRUM_WEIGHT_CACHE_TTL, null);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error loading epic for task ${taskId}:`, error);
      await cache.setex(cacheKey, this.SCRUM_WEIGHT_CACHE_TTL, null);
      return null;
    }
  }

  /**
   * Получает название проекта/группы с кешированием
   * @param groupId ID группы/проекта
   * @returns Название группы или null
   */
  private async getGroupName(groupId: string): Promise<string | null> {
    if (!groupId || groupId === '0') {
      return null;
    }

    const cacheKey = `group:name:${groupId}`;
    const cached = await cache.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached as string | null;
    }

    try {
      // Пробуем получить информацию о группе
      const groupData = await this.client.call<any>('sonet_group.get', {
        ID: groupId,
      }, { silent: true });

      console.log(`🔍 Group ${groupId} data:`, JSON.stringify(groupData).substring(0, 300));

      // API возвращает массив всех групп, нужно найти нужную по ID
      let groupName: string | null = null;

      if (Array.isArray(groupData)) {
        // Ищем группу с нужным ID в массиве
        const group = groupData.find(g => String(g.ID) === String(groupId));
        if (group) {
          groupName = group.NAME || group.name || null;
        }
      } else {
        // Если вдруг вернулся один объект (для совместимости)
        groupName = groupData?.NAME || groupData?.name || null;
      }

      groupName = groupName ? String(groupName).trim() : null;

      if (groupName) {
        console.log(`✅ Group ${groupId} name: ${groupName}`);
      } else {
        console.log(`⚠️ Group ${groupId}: no name found in response`);
      }

      // Кешируем на долгое время - названия проектов меняются редко
      await cache.setex(cacheKey, 86400, groupName); // 24 часа
      return groupName;
    } catch (error) {
      console.error(`❌ Error loading group ${groupId}:`, error);
      await cache.setex(cacheKey, 86400, null);
      return null;
    }
  }

  public async enrichTasksData(tasks: BitrixTask[]): Promise<BitrixTask[]> {
    console.log(`🔄 enrichTasksData вызван для ${tasks.length} задач`);

    if (tasks.length === 0) {
      console.warn('⚠️ enrichTasksData: список задач пуст');
      return [];
    }

    const enrichedTasks: BitrixTask[] = [];
    const now = new Date();

    // Загружаем теги через batch API (tasks.task.list не возвращает теги)
    const tagsMap = await this.loadTaskTagsBatch(tasks);
    console.log(`🏷️ Загружено тегов для ${tagsMap.size} задач`);

    const scrumWeightsMap = new Map<string, number | null>();
    const scrumEpicsMap = new Map<string, string | null>();

    // Получаем Scrum-веса и эпики только если включена загрузка И задача в проекте 52
    if (this.LOAD_SCRUM_WEIGHTS) {
      // Фильтруем только задачи из проекта 52 (Scrum проект)
      const scrumProjectTasks = tasks.filter((task: any) => {
        const groupId = String(task.GROUP_ID || task.groupId || '');
        return groupId === '52';
      });

      if (scrumProjectTasks.length > 0) {
        // Ограничиваем количество параллельных запросов до 10 для избежания перегрузки API
        const batchSize = 10;
        console.log(`📊 Загрузка Scrum-данных включена. Обрабатываем ${scrumProjectTasks.length} задач из проекта 52 (батчами по ${batchSize})`);

        for (let i = 0; i < scrumProjectTasks.length; i += batchSize) {
          const batch = scrumProjectTasks.slice(i, i + batchSize);
          const batchPromises = batch.map(async (task) => {
            const taskAny = task as any;
            const taskId = taskAny.id || taskAny.ID;

            if (taskId) {
              // Загружаем вес
              const weight = await this.getScrumTaskWeight(taskId);
              if (weight !== null) {
                scrumWeightsMap.set(taskId, weight);
              }

              // Загружаем эпик (система)
              const epic = await this.getScrumTaskEpic(taskId);
              if (epic !== null) {
                scrumEpicsMap.set(taskId, epic);
              }
            }
          });

          // Ждем завершения текущего батча перед следующим
          await Promise.allSettled(batchPromises);
        }
        console.log(`✅ Загружено ${scrumWeightsMap.size} Scrum-весов и ${scrumEpicsMap.size} эпиков из ${scrumProjectTasks.length} задач проекта 52`);
      } else {
        console.log(`⏭️ Нет задач из проекта 52 для загрузки Scrum-данных`);
      }
    } else {
      console.log(`⏭️ Загрузка Scrum-данных отключена (LOAD_SCRUM_WEIGHTS=false или не задано)`);
    }

    // Загружаем названия групп для всех задач с GROUP_ID
    const groupNamesMap = new Map<string, string | null>();
    const uniqueGroupIds = new Set<string>();

    tasks.forEach((task: any) => {
      const groupId = String(task.GROUP_ID || task.groupId || '');
      if (groupId && groupId !== '0') {
        uniqueGroupIds.add(groupId);
      }
    });

    if (uniqueGroupIds.size > 0) {
      console.log(`🏢 Загрузка названий групп для ${uniqueGroupIds.size} проектов...`);
      const groupLoadPromises = Array.from(uniqueGroupIds).map(async (groupId) => {
        const groupName = await this.getGroupName(groupId);
        if (groupName) {
          groupNamesMap.set(groupId, groupName);
        }
      });
      await Promise.allSettled(groupLoadPromises);
      console.log(`✅ Загружено ${groupNamesMap.size} названий групп`);
    }

    // Быстрое обогащение без истории - используем только CHANGED_DATE
    for (const task of tasks) {
      // Маппинг полей из camelCase в UPPER_CASE для совместимости
      const taskAny = task as any;
      
      // Получаем ID задачи
      const taskId = taskAny.id || taskAny.ID;

      // Получаем теги из загруженной Map (теги загружены через batch API)
      let tags: string[] = tagsMap.get(String(taskId)) || [];

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

      // Автоматически определяем систему из эпика (Scrum) или названия группы
      const hasSystemInTags = tags.some(tag => {
        const lowerTag = String(tag).toLowerCase().trim();
        return lowerTag.startsWith('system:');
      });

      if (!hasSystemInTags) {
        let systemName: string | null = null;

        // Приоритет 1: Эпик из Scrum (для задач в проекте 52)
        const scrumEpic = scrumEpicsMap.get(taskId);
        if (scrumEpic) {
          systemName = normalizeSystemName(scrumEpic);
        }

        // Приоритет 2: Название группы/проекта (если система не определена)
        if (!systemName) {
          const groupId = String(taskAny.groupId || taskAny.GROUP_ID || '');
          if (groupId && groupId !== '0') {
            const groupName = groupNamesMap.get(groupId);
            if (groupName) {
              systemName = normalizeSystemName(groupName);
            }
          }
        }

        // Добавляем тег system: если система определена и нормализована
        if (systemName) {
          tags.push(`system:${systemName}`);
        }
      }

      // Приоритеты P0-P3 определяются пользователем вручную через теги p:P0, p:P1, p:P2, p:P3

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
      
      let inactiveDays = 0;
      if (lastActivity) {
        try {
          const lastActivityDate = new Date(lastActivity);
          if (!isNaN(lastActivityDate.getTime())) {
            inactiveDays = Math.floor(
              (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
            );
          }
        } catch (error) {
          console.warn(`⚠️ Ошибка при обработке даты для задачи ${taskId}:`, error);
        }
      }
      
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
    
    console.log(`✅ enrichTasksData: обработано ${enrichedTasks.length} задач из ${tasks.length} входных`);
    
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