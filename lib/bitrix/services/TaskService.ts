import { BitrixClient } from '../client';
import { BitrixTask, BitrixCalendarEvent, UserAbsenceInfo } from '../types';

export class TaskService {
  constructor(private client: BitrixClient) {}

  async getAllTasks(userIds: string[]): Promise<{ activeTasks: BitrixTask[], completedTasks: BitrixTask[] }> {
    console.log(`📋 TaskService: Начало получения активных и завершенных задач для ${userIds.length} пользователей`);
    
    if (userIds.length === 0) {
      console.log('⚠️ Список пользователей пуст, возвращаем пустые массивы');
      return { activeTasks: [], completedTasks: [] };
    }
    
    // Дата для фильтрации завершенных задач (последние 30 дней)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    console.log(`📅 Дата для завершенных задач: ${thirtyDaysAgo.toISOString()}`);
    
    const userChunks = this.chunkArray(userIds, 10);
    const allActiveTasks: BitrixTask[] = [];
    const allCompletedTasks: BitrixTask[] = [];
    
    for (const [index, chunk] of userChunks.entries()) {
      console.log(`🔄 Обработка группы ${index + 1}/${userChunks.length} (${chunk.length} пользователей)`);
      console.log(`   User IDs: ${chunk.join(', ')}`);
      
      try {
        // Получаем активные задачи (исключаем завершенные и отложенные)
        console.log(`   📋 Получение активных задач...`);
        const activeStart = Date.now();
        const activeTasks = await this.client.getAllTasks({
          RESPONSIBLE_ID: chunk,
          '!STATUS': [5, 6] // Исключаем завершенные (5) и отложенные (6)
        });
        console.log(`   ✅ Получено ${activeTasks.length} активных задач за ${Date.now() - activeStart}мс`);
        allActiveTasks.push(...activeTasks);
        
        // Получаем завершенные задачи за последние 30 дней
        console.log(`   ✔️ Получение завершенных задач за 30 дней...`);
        const completedStart = Date.now();
        const completedTasks = await this.client.getAllTasks({
          RESPONSIBLE_ID: chunk,
          STATUS: 5, // Только завершенные
          '>=CLOSED_DATE': thirtyDaysAgo.toISOString()
        });
        console.log(`   ✅ Получено ${completedTasks.length} завершенных задач за ${Date.now() - completedStart}мс`);
        allCompletedTasks.push(...completedTasks);
        
      } catch (error) {
        console.error(`   ❌ Ошибка при получении задач для группы ${index + 1}:`, error);
        // Продолжаем с другими группами
      }
    }
    
    console.log(`📊 Всего получено: ${allActiveTasks.length} активных, ${allCompletedTasks.length} завершенных задач`);
    console.log('🔧 Обогащение данных задач...');
    
    // Обогащаем данные для обеих групп
    const enrichedActiveTasks = await this.enrichTasksData(allActiveTasks);
    const enrichedCompletedTasks = await this.enrichTasksData(allCompletedTasks);
    
    console.log('✅ Обогащение завершено');
    
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
    console.log(`✔️ TaskService: Начало получения завершенных задач за ${days} дней`);
    
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    console.log(`📅 Дата с которой ищем: ${dateFrom.toISOString()}`);
    
    const userChunks = this.chunkArray(userIds, 10);
    const allTasks: BitrixTask[] = [];
    
    for (const [index, chunk] of userChunks.entries()) {
      console.log(`🔄 Обработка группы ${index + 1}/${userChunks.length} (${chunk.length} пользователей)`);
      
      try {
        const chunkStart = Date.now();
        
        // Получаем ВСЕ задачи (включая завершенные)
        const allUserTasks = await this.client.getAllTasks({
          RESPONSIBLE_ID: chunk
        });
        
        console.log(`   📦 Получено всего ${allUserTasks.length} задач`);
        
        // Фильтруем завершенные задачи
        const completedTasks = allUserTasks.filter((task: any) => {
          // Проверяем статус (5 = завершена)
          const status = task.STATUS || task.status;
          if (status !== '5' && status !== 5) return false;
          
          // Проверяем дату закрытия
          const closedDate = task.CLOSED_DATE || task.closedDate || task.CHANGED_DATE || task.changedDate;
          if (!closedDate) {
            console.log(`   ⚠️ Задача ${task.ID || task.id} без даты закрытия`);
            return false;
          }
          
          const taskClosedDate = new Date(closedDate);
          const isInRange = taskClosedDate >= dateFrom;
          
          if (!isInRange) {
            console.log(`   📅 Задача ${task.ID || task.id} закрыта ${closedDate} (вне диапазона)`);
          }
          
          return isInRange;
        });
        
        console.log(`   ✅ Из них завершенных за последние ${days} дней: ${completedTasks.length} за ${Date.now() - chunkStart}мс`);
        
        // Выведем первые несколько завершенных задач для отладки
        if (completedTasks.length > 0 && index === 0) {
          const firstTask = completedTasks[0];
          console.log('   🔍 Пример завершенной задачи:', {
            id: firstTask.ID || firstTask.id,
            title: firstTask.TITLE || firstTask.title,
            status: firstTask.STATUS || firstTask.status,
            closedDate: firstTask.CLOSED_DATE || firstTask.closedDate,
            responsibleId: firstTask.RESPONSIBLE_ID || firstTask.responsibleId
          });
        }
        
        allTasks.push(...completedTasks);
      } catch (error) {
        console.error(`   ❌ Ошибка при получении завершенных задач для группы ${index + 1}:`, error);
      }
    }
    
    console.log(`📊 Всего получено ${allTasks.length} завершенных задач за последние ${days} дней`);
    
    // Обогащаем данные
    const enrichedTasks = await this.enrichTasksData(allTasks);
    
    return enrichedTasks;
  }

  private async enrichTasksData(tasks: BitrixTask[]): Promise<BitrixTask[]> {
    console.log(`🔧 Начало обогащения ${tasks.length} задач`);
    const enrichedTasks: BitrixTask[] = [];
    const now = new Date();
    
    // Подсчитаем статистику по статусам (только общее количество для производительности)
    console.log(`📊 Обогащение ${tasks.length} задач...`);
    
    // Быстрое обогащение без истории - используем только CHANGED_DATE
    for (const task of tasks) {
      // Маппинг полей из camelCase в UPPER_CASE для совместимости
      const taskAny = task as any;
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
        TAGS: taskAny.tags || taskAny.TAGS,
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
        // Логируем только первые 3 задачи в работе для отладки
        if (enrichedTasks.filter(t => t.isInProgress).length < 3) {
          console.log(`   🔷 Задача в работе: ${mappedTask.TITLE?.substring(0, 50)}... (ID: ${mappedTask.ID}, время: ${executionTime} дней)`);
        }
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
    
    console.log(`✅ Обогащение завершено для ${enrichedTasks.length} задач`);
    
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
    console.log(`📅 TaskService: Пропускаем получение отсутствий (API недоступен)`);
    
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