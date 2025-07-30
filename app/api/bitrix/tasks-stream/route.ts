import { NextRequest } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { DepartmentService } from '@/lib/bitrix/services/DepartmentService';
import { TaskService } from '@/lib/bitrix/services/TaskService';
import { cache } from '@/lib/cache';
import { BitrixTask, BitrixUser, TaskStats, UserAbsenceInfo } from '@/lib/bitrix/types';
import { getConfiguredWebhookUrl, getConfiguredDepartmentName } from '@/lib/config';

const CACHE_TTL = 300; // 5 minutes

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

        // Get active tasks
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Загрузка активных задач...',
          progress: 30 
        })}\n\n`));
        
        const activeTasks = await taskService.getAllDepartmentTasks(userIds);

        // Get completed tasks
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Загрузка завершенных задач...',
          progress: 50 
        })}\n\n`));
        
        const completedTasks = await taskService.getCompletedTasks(userIds, 30);

        // Get users info
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Получение информации о пользователях...',
          progress: 70 
        })}\n\n`));
        
        const users = await getUsers(userIds, client);

        // Get absences
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Проверка отсутствий сотрудников...',
          progress: 85 
        })}\n\n`));
        
        const absences = await taskService.getAbsenceEvents(userIds);

        // Generate stats
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: 'Генерация статистики...',
          progress: 95 
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
  const stats: TaskStats = {
    totalActive: activeTasks.length,
    totalCompleted: completedTasks.length,
    criticalTasks: activeTasks.filter(t => t.priority === 'critical').length,
    warningTasks: activeTasks.filter(t => t.priority === 'warning').length,
    overdueTasks: activeTasks.filter(t => t.isOverdue).length,
    inProgressTasks: activeTasks.filter(t => t.isInProgress).length,
    byEmployee: {},
    byStatus: {},
    inactivityDistribution: {
      '0-1 день': 0,
      '2-3 дня': 0,
      '4-7 дней': 0,
      'Более недели': 0
    }
  };

  // Employee statistics
  users.forEach(user => {
    const userId = user.ID;
    const active = activeTasks.filter(t => t.RESPONSIBLE_ID === userId);
    const completed = completedTasks.filter(t => t.RESPONSIBLE_ID === userId);
    const absenceInfo = absences[userId];
    
    stats.byEmployee[userId] = {
      name: `${user.NAME} ${user.LAST_NAME}`,
      active: active.length,
      completed: completed.length,
      critical: active.filter(t => t.priority === 'critical').length,
      warning: active.filter(t => t.priority === 'warning').length,
      overdue: active.filter(t => t.isOverdue).length,
      inProgress: active.filter(t => t.isInProgress).length,
      avgInactiveDays: active.length > 0 
        ? Math.round(active.reduce((sum, t) => sum + (t.inactiveDays || 0), 0) / active.length)
        : 0,
      isAbsent: absenceInfo?.isAbsent || false
    };
  });

  // Status statistics
  const statusMap: Record<string, string> = {
    '1': 'Новая',
    '2': 'Ждет выполнения',
    '3': 'Выполняется',
    '4': 'Ждет контроля',
    '5': 'Завершена',
    '6': 'Отложена',
    '7': 'Отклонена'
  };

  activeTasks.forEach(task => {
    const statusName = statusMap[task.STATUS] || 'Неизвестно';
    stats.byStatus[statusName] = (stats.byStatus[statusName] || 0) + 1;

    // Inactivity distribution
    const days = task.inactiveDays || 0;
    if (days <= 1) stats.inactivityDistribution['0-1 день']++;
    else if (days <= 3) stats.inactivityDistribution['2-3 дня']++;
    else if (days <= 7) stats.inactivityDistribution['4-7 дней']++;
    else stats.inactivityDistribution['Более недели']++;
  });

  return stats;
}