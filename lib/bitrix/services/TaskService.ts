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

  async getAbsenceEvents(userIds: string[]): Promise<Record<string, UserAbsenceInfo>> {
    console.log(`📅 TaskService: Получение календарных событий отсутствий для ${userIds.length} пользователей`);
    
    const absenceInfo: Record<string, UserAbsenceInfo> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateFrom = new Date();
    dateFrom.setDate(today.getDate() - 7); // Проверяем отсутствия за последнюю неделю
    const dateTo = new Date();
    dateTo.setDate(today.getDate() + 30); // И на месяц вперед для будущих отсутствий
    
    console.log(`📅 Диапазон дат: ${dateFrom.toISOString()} - ${dateTo.toISOString()}`)
    
    // Инициализируем всех пользователей как присутствующих
    for (const userId of userIds) {
      absenceInfo[userId] = {
        userId,
        isAbsent: false
      };
    }
    
    try {
      // Сначала попробуем получить список секций календаря для первого пользователя
      if (userIds.length > 0) {
        console.log(`🔍 Получаем секции календаря для пользователя ${userIds[0]}`);
        try {
          // Получаем список секций календаря
          const sections = await this.client.call('calendar.section.get', {
            type: 'user',
            ownerId: userIds[0]
          });
          console.log('📅 Секции календаря:', sections);
          
          // Пробуем получить события из всех секций
          if (sections && Array.isArray(sections)) {
            for (const section of sections.slice(0, 2)) { // Проверяем первые 2 секции
              const sectionEvents = await this.client.call('calendar.event.get', {
                type: 'user',
                ownerId: userIds[0],
                section: section.ID,
                from: dateFrom.toISOString().split('T')[0],
                to: dateTo.toISOString().split('T')[0]
              });
              console.log(`📅 События в секции "${section.NAME}" (ID: ${section.ID}):`, {
                count: sectionEvents?.length || 0,
                firstEvent: sectionEvents?.[0]
              });
            }
          }
        } catch (error) {
          console.error('❌ Ошибка при получении секций:', error);
        }
        
        // Пробуем получить график отсутствий
        console.log('🔍 Пробуем получить график отсутствий');
        try {
          // Пробуем различные методы API
          const absenceChart = await this.client.call('intranet.absence.get', {
            from: dateFrom.toISOString().split('T')[0],
            to: dateTo.toISOString().split('T')[0]
          });
          console.log('📅 График отсутствий (intranet.absence.get):', absenceChart);
        } catch (error) {
          console.log('⚠️ Метод intranet.absence.get недоступен');
        }
        
        try {
          // Пробуем через timeman
          const timemanStatus = await this.client.call('timeman.status', {});
          console.log('⏰ Статус рабочего времени (timeman.status):', timemanStatus);
        } catch (error) {
          console.log('⚠️ Метод timeman.status недоступен');
        }
      }
      
      // Получаем календарные события для всех пользователей
      const batchCommands: any = {};
      
      userIds.forEach((userId, index) => {
        batchCommands[`user_${userId}`] = {
          method: 'calendar.event.get',
          params: {
            type: 'user',
            ownerId: userId,
            from: dateFrom.toISOString().split('T')[0],
            to: dateTo.toISOString().split('T')[0]
          }
        };
      });
      
      // Также попробуем получить события из общего календаря компании
      batchCommands['company_calendar'] = {
        method: 'calendar.event.get',
        params: {
          type: 'company_calendar',
          from: dateFrom.toISOString().split('T')[0],
          to: dateTo.toISOString().split('T')[0]
        }
      };
      
      // Выполняем batch запрос группами по 50
      const commandChunks = this.chunkObject(batchCommands, 50);
      
      console.log(`📋 Выполняем ${commandChunks.length} batch запросов для получения календарных событий`);
      console.log('📝 Пример команд для batch:', {
        totalCommands: Object.keys(batchCommands).length,
        firstCommand: batchCommands[Object.keys(batchCommands)[0]]
      });
      
      for (const chunk of commandChunks) {
        try {
          const response = await this.client.call('batch', { cmd: chunk });
          
          console.log('📥 Получен ответ от batch API:', {
            hasResult: !!response.result,
            resultKeys: response.result ? Object.keys(response.result).length : 0,
            result: response.result
          });
          
          // Проверяем на ошибки
          if (response.result_error) {
            console.error('❌ Ошибки в batch запросе:', response.result_error);
          }
          
          // Обрабатываем результаты
          const results = response.result || {};
          for (const [key, result] of Object.entries(results)) {
            // Обработка общего календаря компании
            if (key === 'company_calendar') {
              if (result && Array.isArray(result)) {
                console.log(`   🏢 Общий календарь компании: ${result.length} событий`);
                
                // Ищем события отсутствий для наших пользователей
                result.forEach((event: any) => {
                  if (event.OWNER_ID && userIds.includes(event.OWNER_ID)) {
                    const isAbsent = event.ACCESSIBILITY === 'absent' || 
                                   event.ACCESSIBILITY === 'ABSENT' ||
                                   (event.NAME && (
                                     event.NAME.toLowerCase().includes('отпуск') ||
                                     event.NAME.toLowerCase().includes('больничный') ||
                                     event.NAME.toLowerCase().includes('командировка') ||
                                     event.NAME.toLowerCase().includes('отсутств')
                                   ));
                    
                    if (isAbsent) {
                      console.log(`   📅 Найдено отсутствие в общем календаре для пользователя ${event.OWNER_ID}: ${event.NAME}`);
                    }
                  }
                });
              }
              continue;
            }
            
            const userId = key.replace('user_', '');
            
            if (result && Array.isArray(result)) {
              // Логируем только если есть события
              if (result.length > 0) {
                console.log(`   👤 Пользователь ${userId}: ${result.length} событий`);
              }
              
              // Детальное логирование только при необходимости (убрано для производительности)
              
              // Фильтруем только события с типом "absent"
              const allAbsenceEvents = result.filter((event: any) => {
                // Проверяем различные способы обозначения отсутствия
                const isAbsent = event.ACCESSIBILITY === 'absent' || 
                                 event.ACCESSIBILITY === 'ABSENT' ||
                                 (event.NAME && (
                                   event.NAME.toLowerCase().includes('отпуск') ||
                                   event.NAME.toLowerCase().includes('больничный') ||
                                   event.NAME.toLowerCase().includes('командировка') ||
                                   event.NAME.toLowerCase().includes('отсутств')
                                 ));
                
                // Убрано детальное логирование для производительности
                
                return isAbsent;
              });
              
              // Логируем только значимые отсутствия
              
              // Ищем текущие отсутствия
              const currentAbsences = allAbsenceEvents.filter((event: any) => {
                const eventStart = new Date(event.DATE_FROM);
                const eventEnd = new Date(event.DATE_TO);
                return eventStart <= today && eventEnd >= today;
              });
              
              // Ищем будущие отсутствия
              const futureAbsences = allAbsenceEvents.filter((event: any) => {
                const eventStart = new Date(event.DATE_FROM);
                return eventStart > today;
              }).sort((a: any, b: any) => 
                new Date(a.DATE_FROM).getTime() - new Date(b.DATE_FROM).getTime()
              );
              
              // Обновляем информацию о пользователе
              if (currentAbsences.length > 0) {
                const currentAbsence = currentAbsences[0];
                absenceInfo[userId] = {
                  userId,
                  isAbsent: true,
                  absenceType: currentAbsence.NAME || 'Отсутствует',
                  dateFrom: currentAbsence.DATE_FROM,
                  dateTo: currentAbsence.DATE_TO,
                  eventName: currentAbsence.NAME
                };
                
                console.log(`   👤 Пользователь ${userId} отсутствует`);
              }
              
              // Добавляем информацию о ближайшем будущем отсутствии
              if (futureAbsences.length > 0 && !absenceInfo[userId].isAbsent) {
                const nextAbsence = futureAbsences[0];
                const eventStart = new Date(nextAbsence.DATE_FROM);
                const daysUntil = Math.ceil(
                  (eventStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );
                
                absenceInfo[userId].futureAbsence = {
                  dateFrom: nextAbsence.DATE_FROM,
                  dateTo: nextAbsence.DATE_TO,
                  eventName: nextAbsence.NAME || 'Отсутствие',
                  daysUntil
                };
                
                // Убрано детальное логирование будущих отсутствий
              }
            }
          }
        } catch (error) {
          console.error('❌ Ошибка при получении календарных событий:', error);
          // Продолжаем даже если batch запрос не удался
        }
      }
    } catch (error) {
      console.error('❌ Ошибка при получении отсутствий:', error);
    }
    
    const absentCount = Object.values(absenceInfo).filter(info => info.isAbsent).length;
    const futureCount = Object.values(absenceInfo).filter(info => info.futureAbsence).length;
    console.log(`✅ Получена информация об отсутствиях: ${absentCount} сотрудников отсутствуют, ${futureCount} запланировали отсутствия`);
    
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