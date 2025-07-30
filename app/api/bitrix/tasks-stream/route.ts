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
      
      try {
        // Send initial progress
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'complete', 
              data: cached 
            })}\n\n`));
            controller.close();
            return;
          }
        }

        const webhookUrl = await getConfiguredWebhookUrl();
        const departmentName = await getConfiguredDepartmentName();

        const client = new BitrixClient(webhookUrl);
        const deptService = new DepartmentService(client);
        const taskService = new TaskService(client);
        
        // Get department
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Получение пользователей департамента...',
          progress: 20 
        })}\n\n`));
        
        const userIds = await deptService.getAllDepartmentUsers(department.ID, true);

        // Get active and completed tasks with optimized filters
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Загрузка активных и завершенных задач...',
          progress: 30 
        })}\n\n`));
        
        const { activeTasks, completedTasks } = await taskService.getAllTasks(userIds);
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Задачи успешно загружены...',
          progress: 60 
        })}\n\n`));

        // Get users info
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Получение информации о пользователях...',
          progress: 75 
        })}\n\n`));
        
        const users = await getUsers(userIds, client);

        // Skip absences for now (API methods not available)
        const absences: Record<string, any> = {};

        // Generate stats
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Генерация статистики...',
          progress: 90 
        })}\n\n`));
        
        const stats = generateStats(activeTasks, completedTasks, users, absences);

        const result = {
          tasks: activeTasks,
          completedTasks,
          users,
          department,
          stats,
          absences,
          timestamp: new Date().toISOString()
        };

        // Save to cache
        await cache.setex('dashboard:tasks', CACHE_TTL, result);

        // Send final data
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'complete', 
          data: result,
          loadTime: Date.now() - startTime
        })}\n\n`));
        
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Неизвестная ошибка' 
        })}\n\n`));
        controller.close();
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
  console.log(`📊 Начало генерации статистики: ${activeTasks.length} активных, ${completedTasks.length} завершенных задач`);
  
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

  console.log('📊 Обработка активных задач...');
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

  console.log('📊 Обработка завершенных задач...');
  // Обрабатываем завершенные задачи одним проходом
  completedTasks.forEach(task => {
    const userId = task.RESPONSIBLE_ID;
    if (userTaskCounts[userId]) {
      userTaskCounts[userId].completed.push(task);
    }
  });

  console.log('📊 Формирование статистики по сотрудникам...');
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

  console.log('✅ Генерация статистики завершена');
  return stats;
}