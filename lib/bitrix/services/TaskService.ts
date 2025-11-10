import { BitrixClient } from '../client';
import { BitrixTask } from '../types';
import { TaskMetadata, mergeTagsWithMetadata } from '@/lib/tasks/metadata';

export class TaskService {
  constructor(private client: BitrixClient) {}

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
    return enriched[0];
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
    return enriched[0] ?? null;
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

    return Boolean(result?.result ?? result);
  }

  async completeTask(taskId: string): Promise<boolean> {
    const result = await this.client.call<{ result: boolean }>('tasks.task.complete', {
      taskId,
    });
    return Boolean(result?.result ?? result);
  }

  private async enrichTasksData(tasks: BitrixTask[]): Promise<BitrixTask[]> {
    const enrichedTasks: BitrixTask[] = [];
    const now = new Date();
    
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
      
      // Логируем для отладки (только первые несколько задач)
      if (enrichedTasks.length < 3 && tags.length === 0 && taskAny.ID) {
        console.log(`🔍 Задача ${taskAny.ID}: теги не найдены. Структура:`, {
          hasTAGS: !!taskAny.TAGS,
          hasTags: !!taskAny.tags,
          hasTaskTAGS: !!taskAny.task?.TAGS,
          TAGSValue: taskAny.TAGS,
          tagsValue: taskAny.tags,
        });
      }
      
      const mappedTask: BitrixTask = {
        ID: taskAny.id || taskAny.ID,
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