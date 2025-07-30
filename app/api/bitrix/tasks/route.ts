import { NextResponse } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { DepartmentService } from '@/lib/bitrix/services/DepartmentService';
import { TaskService } from '@/lib/bitrix/services/TaskService';
import { cache } from '@/lib/cache';
import { BitrixTask, BitrixUser, TaskStats, UserAbsenceInfo } from '@/lib/bitrix/types';
import { getConfiguredWebhookUrl, getConfiguredDepartmentName } from '@/lib/config';

const CACHE_TTL = 900; // 15 minutes

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('🚀 API /api/bitrix/tasks - Начало обработки запроса');
  
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Check cache
    if (!forceRefresh) {
      console.log('📦 Проверка кэша...');
      const cached = await cache.get('dashboard:tasks');
      if (cached) {
        console.log('✅ Данные из кэша, время выполнения:', Date.now() - startTime, 'мс');
        return NextResponse.json(cached);
      }
      console.log('❌ Кэш пуст или устарел');
    }

    const webhookUrl = await getConfiguredWebhookUrl();
    const departmentName = await getConfiguredDepartmentName();
    console.log('🔗 Webhook URL настроен');

    const client = new BitrixClient(webhookUrl);
    const deptService = new DepartmentService(client);
    const taskService = new TaskService(client);
    
    // Get department and users
    console.log(`🏢 Получение департамента "${departmentName}"...`);
    const department = await deptService.getDepartmentByName(departmentName);
    if (!department) {
      throw new Error(`Департамент "${departmentName}" не найден`);
    }
    console.log(`✅ Департамент найден: ${department.NAME} (ID: ${department.ID})`);

    console.log('👥 Получение пользователей департамента...');
    const userIds = await deptService.getAllDepartmentUsers(department.ID, true);
    console.log(`✅ Найдено ${userIds.length} пользователей`);

    // Get active and completed tasks with optimized filters
    console.log('📋 Получение активных и завершенных задач с фильтрами...');
    const tasksStart = Date.now();
    const { activeTasks, completedTasks } = await taskService.getAllTasks(userIds);
    console.log(`✅ Получено ${activeTasks.length} активных и ${completedTasks.length} завершенных задач за ${Date.now() - tasksStart}мс`);

    // Get user information
    console.log('👤 Получение информации о пользователях...');
    const users = await getUsers(userIds, client);
    console.log(`✅ Получена информация о ${users.length} пользователях`);
    
    // Логируем пользователей для поиска Павла Свистунова
    const pavel = users.find(u => u.NAME?.includes('Павел') || u.LAST_NAME?.includes('Свистунов'));
    if (pavel) {
      console.log('🔍 Найден Павел Свистунов:', { 
        id: pavel.ID, 
        name: `${pavel.NAME} ${pavel.LAST_NAME}` 
      });
    }

    // Skip absence information for now (API methods not available)
    console.log('📅 Пропускаем получение отсутствий (API недоступен)');
    const absences: Record<string, any> = {};

    // Generate statistics
    console.log('📊 Генерация статистики...');
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
    console.log('💾 Сохранение в кэш...');
    await cache.setex('dashboard:tasks', CACHE_TTL, result);

    const totalTime = Date.now() - startTime;
    console.log(`✅ Запрос выполнен успешно за ${totalTime}мс`);
    console.log(`📈 Статистика: ${stats.totalActive} активных, ${stats.totalCompleted} завершенных задач`);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ API Error:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    const totalTime = Date.now() - startTime;
    console.log(`⏱️ Время до ошибки: ${totalTime}мс`);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch data' },
      { status: 500 }
    );
  }
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
    // Добавляем поля в нижнем регистре для совместимости
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