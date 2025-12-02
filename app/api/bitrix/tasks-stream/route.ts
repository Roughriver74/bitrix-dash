import { NextRequest } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { DepartmentService } from '@/lib/bitrix/services/DepartmentService';
import { TaskService } from '@/lib/bitrix/services/TaskService';
import { cache } from '@/lib/cache';
import { BitrixTask, BitrixUser, TaskStats, UserAbsenceInfo } from '@/lib/bitrix/types';
import { getConfiguredWebhookUrl, getConfiguredDepartmentName } from '@/lib/config';

const CACHE_TTL = 900; // 15 minutes

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let isClosed = false;

      // Listen for client disconnect
      request.signal.addEventListener('abort', () => {
        isClosed = true;
      });

      try {
        // Send initial progress
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Начало загрузки данных...',
          progress: 0 
        })}\n\n`));

        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === 'true';

        // Check cache
        if (!forceRefresh) {
          const cached = await cache.get('dashboard:tasks');
          if (cached) {
            if (request.signal.aborted) return;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'complete',
              data: cached
            })}\n\n`));
            if (!isClosed) {
              controller.close();
              isClosed = true;
            }
            return;
          }
        }

        const webhookUrl = await getConfiguredWebhookUrl();
        const departmentName = await getConfiguredDepartmentName();

        const client = new BitrixClient(webhookUrl);
        const deptService = new DepartmentService(client);
        const taskService = new TaskService(client);
        
        // Get department
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: `Получение департамента "${departmentName}"...`,
          progress: 10 
        })}\n\n`));
        
        const department = await deptService.getDepartmentByName(departmentName);
        if (!department) {
          throw new Error(`Департамент "${departmentName}" не найден`);
        }

        // Get users
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Получение пользователей департамента...',
          progress: 20 
        })}\n\n`));
        
        const userIds = await deptService.getAllDepartmentUsers(department.ID, true);

        // Get active and completed tasks with optimized filters
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Загрузка активных и завершенных задач...',
          progress: 30 
        })}\n\n`));
        
        const { activeTasks, completedTasks } = await taskService.getAllTasks(userIds);
        
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Задачи успешно загружены...',
          progress: 60 
        })}\n\n`));

        // Get users info
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Получение информации о пользователях...',
          progress: 75 
        })}\n\n`));
        
        const users = await getUsers(userIds, client);

        // Skip absences for now (API methods not available)
        const absences: Record<string, any> = {};

        // Generate stats
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Генерация статистики...',
          progress: 90 
        })}\n\n`));
        
        const stats = generateStats(activeTasks, completedTasks, users, absences);

        // Оптимизируем размер данных для передачи через SSE
        const result = {
          tasks: activeTasks.map(task => ({
            ID: task.ID,
            TITLE: task.TITLE,
            RESPONSIBLE_ID: task.RESPONSIBLE_ID,
            STATUS: task.STATUS,
            DEADLINE: task.DEADLINE,
            CREATED_DATE: task.CREATED_DATE,
            CHANGED_DATE: task.CHANGED_DATE,
            priority: task.priority,
            isOverdue: task.isOverdue,
            isInProgress: task.isInProgress,
            inactiveDays: task.inactiveDays,
            lastActivity: task.lastActivity
          })),
          completedTasks: completedTasks.map(task => ({
            ID: task.ID,
            TITLE: task.TITLE,
            RESPONSIBLE_ID: task.RESPONSIBLE_ID,
            STATUS: task.STATUS,
            CLOSED_DATE: task.CLOSED_DATE,
            CREATED_DATE: task.CREATED_DATE
          })),
          users,
          department,
          stats,
          absences,
          timestamp: new Date().toISOString()
        };

        // Save to cache
        await cache.setex('dashboard:tasks', CACHE_TTL, result);

        const resultJsonString = JSON.stringify(result);
        
        // Always use chunked transmission for large payloads to avoid SSE disconnection issues
        const MAX_CHUNK_SIZE = 50000; // Reduced chunk size for better reliability
        
        if (resultJsonString.length > MAX_CHUNK_SIZE) {
          // Send data in chunks
          const chunks = [];
          for (let i = 0; i < resultJsonString.length; i += MAX_CHUNK_SIZE) {
            chunks.push(resultJsonString.slice(i, i + MAX_CHUNK_SIZE));
          }
          
          // Send chunk metadata first
          if (request.signal.aborted) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'chunked_start',
            totalChunks: chunks.length,
            totalSize: resultJsonString.length
          })}\n\n`));
          
          // Small delay between chunks to prevent overwhelming the connection
          for (let i = 0; i < chunks.length; i++) {
            if (request.signal.aborted) return;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'chunk',
              index: i,
              data: chunks[i],
              isLast: i === chunks.length - 1
            })}\n\n`));
            
            // Small delay between chunks (10ms) to prevent buffer overflow
            if (i < chunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
          
          // Ensure final completion message is sent after chunks
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Send completion message
          if (request.signal.aborted) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            loadTime: Date.now() - startTime
          })}\n\n`));
        } else {
          // Send as single message for smaller payloads
          const finalMessage = {
            type: 'complete', 
            data: result,
            loadTime: Date.now() - startTime
          };
          
          if (request.signal.aborted) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalMessage)}\n\n`));
        }

        if (!isClosed && !request.signal.aborted) {
          controller.close();
          isClosed = true;
        }
      } catch (error) {
        // Check if error is due to closed controller or client disconnect
        const isStreamClosed = error instanceof TypeError && 
          (error.message.includes('Controller is already closed') || error.message.includes('closed'));
        
        if (isStreamClosed || request.signal.aborted) {
          // console.log('ℹ️ Stream closed by client or aborted');
          return;
        }

        console.error('❌ SSE Stream ошибка:', error);

        try {
          // Only try to send error if we think the stream is still open
          if (!isClosed && !request.signal.aborted) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Неизвестная ошибка'
            })}\n\n`));
          }
        } catch (enqueueError) {
          // Ignore errors during error reporting (likely stream closed)
        }

        if (!isClosed) {
          try {
            controller.close();
            isClosed = true;
          } catch (closeError) {
            // Ignore errors during close
          }
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function getUsers(userIds: string[], client: BitrixClient): Promise<BitrixUser[]> {
  const users = await client.getAll<BitrixUser>('user.get', {
    filter: { ID: userIds }
  });
  
  return users.map((user: any) => ({
    ID: user.ID || user.id,
    NAME: user.NAME || user.name || '',
    LAST_NAME: user.LAST_NAME || user.lastName || '',
    EMAIL: user.EMAIL || user.email || '',
    WORK_POSITION: user.WORK_POSITION || user.workPosition || '',
    UF_DEPARTMENT: user.UF_DEPARTMENT || user.ufDepartment || [],
    ACTIVE: user.ACTIVE !== undefined ? user.ACTIVE : (user.active !== undefined ? user.active : true),
    id: user.ID || user.id,
    name: `${user.NAME || user.name || ''} ${user.LAST_NAME || user.lastName || ''}`.trim()
  }));
}

function generateStats(activeTasks: BitrixTask[], completedTasks: BitrixTask[], users: BitrixUser[], absences: Record<string, UserAbsenceInfo>): TaskStats {
  const stats: TaskStats = {
    totalActive: activeTasks.length,
    totalCompleted: completedTasks.length,
    criticalTasks: 0,
    warningTasks: 0,
    overdueTasks: 0,
    inProgressTasks: 0,
    byEmployee: {},
    byStatus: {},
    inactivityDistribution: {
      '0-1 день': 0,
      '2-3 дня': 0,
      '4-7 дней': 0,
      'Более недели': 0
    }
  };

  // Инициализируем статистику по сотрудникам
  const userTaskCounts: Record<string, {
    active: BitrixTask[],
    completed: BitrixTask[],
    critical: number,
    warning: number,
    overdue: number,
    inProgress: number,
    inactiveDaysSum: number
  }> = {};

  users.forEach(user => {
    userTaskCounts[user.ID] = {
      active: [],
      completed: [],
      critical: 0,
      warning: 0,
      overdue: 0,
      inProgress: 0,
      inactiveDaysSum: 0
    };
  });

  // Обрабатываем активные задачи одним проходом
  activeTasks.forEach(task => {
    // Общая статистика
    if (task.priority === 'critical') stats.criticalTasks++;
    if (task.priority === 'warning') stats.warningTasks++;
    if (task.isOverdue) stats.overdueTasks++;
    if (task.isInProgress) stats.inProgressTasks++;

    // Статистика по статусам
    const statusMap: Record<string, string> = {
      '1': 'Новая',
      '2': 'Ждет выполнения',
      '3': 'Выполняется',
      '4': 'Ждет контроля',
      '5': 'Завершена',
      '6': 'Отложена',
      '7': 'Отклонена'
    };
    const statusName = statusMap[task.STATUS] || 'Неизвестно';
    stats.byStatus[statusName] = (stats.byStatus[statusName] || 0) + 1;

    // Распределение по неактивности
    const days = task.inactiveDays || 0;
    if (days <= 1) stats.inactivityDistribution['0-1 день']++;
    else if (days <= 3) stats.inactivityDistribution['2-3 дня']++;
    else if (days <= 7) stats.inactivityDistribution['4-7 дней']++;
    else stats.inactivityDistribution['Более недели']++;

    // Статистика по сотрудникам
    const userId = task.RESPONSIBLE_ID;
    if (userTaskCounts[userId]) {
      userTaskCounts[userId].active.push(task);
      if (task.priority === 'critical') userTaskCounts[userId].critical++;
      if (task.priority === 'warning') userTaskCounts[userId].warning++;
      if (task.isOverdue) userTaskCounts[userId].overdue++;
      if (task.isInProgress) userTaskCounts[userId].inProgress++;
      userTaskCounts[userId].inactiveDaysSum += (task.inactiveDays || 0);
    }
  });

  // Обрабатываем завершенные задачи одним проходом
  completedTasks.forEach(task => {
    const userId = task.RESPONSIBLE_ID;
    if (userTaskCounts[userId]) {
      userTaskCounts[userId].completed.push(task);
    }
  });

  // Формируем финальную статистику по сотрудникам
  users.forEach(user => {
    const userId = user.ID;
    const userStats = userTaskCounts[userId];
    const absenceInfo = absences[userId];
    
    stats.byEmployee[userId] = {
      name: `${user.NAME} ${user.LAST_NAME}`,
      active: userStats.active.length,
      completed: userStats.completed.length,
      critical: userStats.critical,
      warning: userStats.warning,
      overdue: userStats.overdue,
      inProgress: userStats.inProgress,
      avgInactiveDays: userStats.active.length > 0 
        ? Math.round(userStats.inactiveDaysSum / userStats.active.length)
        : 0,
      isAbsent: absenceInfo?.isAbsent || false
    };
  });

  return stats;
}