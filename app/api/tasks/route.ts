import { NextResponse } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { DepartmentService } from '@/lib/bitrix/services/DepartmentService';
import {
  CreateTaskOptions,
  TaskService,
  UpdateTaskOptions,
} from '@/lib/bitrix/services/TaskService';
import {
  TaskMetadata,
  attachMetadata,
  sortByManualPriority,
  statusCodeToName,
} from '@/lib/tasks/metadata';
import {
  getConfiguredDepartmentName,
  getConfiguredWebhookUrl,
} from '@/lib/config';
import { BitrixTask, BitrixUser } from '@/lib/bitrix/types';
import { prisma } from '@/lib/prisma';
import { BitrixSyncService } from '@/lib/sync/bitrix';

interface UsersMap {
  [id: string]: {
    id: string;
    name: string;
    email?: string;
    position?: string;
    active: boolean;
  };
}

interface ReorderPayload {
  action: 'reorder';
  tasks: Array<{
    id: string;
    order: number;
    otherTags?: string[];
    metadata?: TaskMetadata;
  }>;
}

interface UpdatePayload {
  id: string;
  fields?: {
    title?: string;
    description?: string;
    responsibleId?: string;
    deadline?: string;
    priority?: number;
    status?: string;
    ufCrmTask?: string[];
  };
  metadata?: TaskMetadata;
  otherTags?: string[];
  tags?: string[];
}

interface CreatePayload {
  title: string;
  responsibleId: string;
  description?: string;
  deadline?: string;
  priority?: number;
  metadata?: TaskMetadata;
  tags?: string[];
  ufCrmTask?: string[];
}

export async function GET(request: Request) {
  try {
    console.log('📥 GET /api/tasks вызван');

    const { url } = request;
    const searchParams = new URL(url).searchParams;
    const forceSync = searchParams.get('forceSync') === 'true';
    const includeCompleted = searchParams.get('includeCompleted') === 'true';

    const { taskService, department, userIds, usersList, usersMap, client } =
      await getDepartmentContext();

    console.log(`👥 Получено ${userIds.length} пользователей для отдела "${department.NAME}"`);

    if (userIds.length === 0) {
      console.warn('⚠️ В отделе нет пользователей');
      return NextResponse.json({
        tasks: [],
        users: [],
        department: {
          id: department.ID,
          name: department.NAME,
        },
      });
    }

    // Если запрошен forceSync, запускаем синхронизацию
    if (forceSync) {
      console.log('🔄 Запрошена принудительная синхронизация');
      const syncService = new BitrixSyncService(client);
      await syncService.syncAllTasks(userIds);
    }

    // Читаем задачи из БД
    console.log('📖 Чтение задач из локальной БД');
    
    // Если БД пустая, и это не forceSync, может стоит запустить синхронизацию?
    // Для начала просто проверим количество
    const count = await prisma.task.count();
    if (count === 0 && !forceSync) {
       console.log('⚠️ БД пуста, запускаем автоматическую синхронизацию');
       const syncService = new BitrixSyncService(client);
       await syncService.syncAllTasks(userIds);
    }

    const whereClause: any = {
      isDeleted: false,
      // Исключаем задачи с тегом "silence"
      tags: {
        none: {
          tag: {
            name: 'silence'
          }
        }
      }
    };

    if (!includeCompleted) {
      // Исключаем завершенные (статус 5) и отложенные (6)
      whereClause.status = {
        notIn: ['5', '6'],
      };
    }

    const dbTasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        tags: {
          include: {
            tag: true
          }
        },
        departments: {
          include: {
            department: true
          }
        },
        system: true,
        priority: true,
        abc: true,
        impact: true,
        responsible: true
      },
      orderBy: [
        { priority: { name: 'asc' } }, // P0, P1...
        { id: 'desc' }
      ]
    });

    console.log(`📦 Получено ${dbTasks.length} задач из БД`);

    // Получаем все системы из БД для выпадающего списка
    const dbSystems = await prisma.system.findMany({
      orderBy: { name: 'asc' }
    });
    const systemNames = dbSystems.map(s => s.name);

    // Получаем все отделы из БД для выпадающего списка
    const dbDepartments = await prisma.department.findMany({
      orderBy: { name: 'asc' }
    });
    const departmentsList = dbDepartments.map(d => ({ id: d.id, name: d.name }));

    // Маппинг задач из БД в формат API
    const payloadTasks = dbTasks.map((task: any, index: number) => {
      const tags = task.tags.map((t: any) => t.tag.name);
      const departments = task.departments.map((d: any) => ({
        id: d.department.id,
        name: d.department.name,
      }));
      
      // Формируем otherTags (все теги, которые не являются метаданными)
      // В текущей реализации мы храним все теги в tags, а метаданные в полях
      // Но для совместимости с фронтендом нужно вернуть tags и otherTags
      
      return {
        id: task.id,
        title: task.title,
        description: task.description || '',
        responsibleId: task.responsibleId,
        responsibleName: task.responsible?.name || task.responsibleName || usersMap[task.responsibleId]?.name || '',
        status: task.status,
        statusName: task.statusName || statusCodeToName(task.status),
        deadline: task.deadline ? task.deadline.toISOString() : null,
        inactiveDays: null, // TODO: вычислять
        priorityLevel: 'normal', // TODO: вычислять
        isOverdue: task.deadline ? new Date(task.deadline) < new Date() && task.status !== '5' : false,
        metadata: {
          manualPriority: null,
          abc: task.abc?.name || null,
          impact: task.impact?.name || null,
          system: task.system?.name || null,
          p: task.priority?.name || null,
          weight: task.weight,
          departments: departments.map((d: any) => d.name), // Используем названия
        },
        departments: departments,
        tags: tags,
        otherTags: tags.filter((t: string) => !t.includes(':')), // Упрощенно
        raw: {
          createdDate: task.createdDate ? task.createdDate.toISOString() : undefined,
          changedDate: task.changedDate ? task.changedDate.toISOString() : undefined,
          closedDate: task.closedDate ? task.closedDate.toISOString() : undefined,
        },
        order: index + 1,
      };
    });

    return NextResponse.json({
      tasks: payloadTasks,
      users: usersList.map((user) => ({
        id: user.ID,
        name: `${user.NAME} ${user.LAST_NAME}`.trim(),
        email: user.EMAIL,
        position: user.WORK_POSITION,
        active: user.ACTIVE,
      })),
      department: {
        id: department.ID,
        name: department.NAME,
      },
      systems: systemNames,
      departments: departmentsList,
    });
  } catch (error) {
    console.error('❌ Tasks GET error:', error);
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Stack trace:', error.stack);
    }

    // Определяем тип ошибки для более понятного сообщения
    let errorMessage = 'Не удалось получить задачи';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('Webhook URL') || error.message.includes('не настроен')) {
        errorMessage = 'Webhook URL не настроен. Пожалуйста, настройте интеграцию с Bitrix24 в /setup';
        statusCode = 503;
      } else if (error.message.includes('Департамент') || error.message.includes('не найден')) {
        errorMessage = 'Отдел не найден. Пожалуйста, проверьте настройки в /setup';
        statusCode = 404;
      } else if (error.message.includes('QUERY_LIMIT_EXCEEDED') || error.message.includes('rate limit')) {
        errorMessage = 'Превышен лимит запросов к API Bitrix24. Попробуйте позже';
        statusCode = 429;
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreatePayload;
    if (!payload?.title || !payload?.responsibleId) {
      return NextResponse.json(
        { error: 'Поле title и responsibleId обязательны' },
        { status: 400 },
      );
    }

    const { taskService, usersMap, usersList } =
      await getTaskServiceContext(true);

    const task = await taskService.createTask({
      title: payload.title,
      responsibleId: payload.responsibleId,
      description: payload.description,
      deadline: payload.deadline,
      priority: payload.priority,
      metadata: payload.metadata,
      tags: payload.tags,
      ufCrmTask: payload.ufCrmTask,
    });

    const taskPayload = prepareTasksPayload([task], usersMap)[0];

    return NextResponse.json(
      {
        task: taskPayload,
        users: usersList.map((user) => ({
          id: user.ID,
          name: `${user.NAME} ${user.LAST_NAME}`.trim(),
          email: user.EMAIL,
          position: user.WORK_POSITION,
          active: user.ACTIVE,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('❌ Tasks POST error:', error);
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Stack trace:', error.stack);
    }

    const errorMessage = error instanceof Error ? error.message : 'Не удалось создать задачу';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as UpdatePayload | ReorderPayload;

    if ('action' in payload && payload.action === 'reorder') {
      const { taskService } = await getTaskServiceContext(false);

      await reorderTasks(taskService, payload.tasks);

      return NextResponse.json({ success: true });
    }

    const updatePayload = payload as UpdatePayload;

    if (!updatePayload?.id) {
      return NextResponse.json(
        { error: 'Поле id обязательно' },
        { status: 400 },
      );
    }

    const { taskService, client, usersMap } = await getTaskServiceContext(true);

    const updateOptions: UpdateTaskOptions = {
      metadata: updatePayload.metadata,
      otherTags: updatePayload.otherTags,
      tags: updatePayload.tags,
    };

    if (updatePayload.fields) {
      updateOptions.title = updatePayload.fields.title;
      updateOptions.description = updatePayload.fields.description;
      updateOptions.responsibleId = updatePayload.fields.responsibleId;
      updateOptions.deadline = updatePayload.fields.deadline;
      updateOptions.priority = updatePayload.fields.priority;
      updateOptions.status = updatePayload.fields.status;
      updateOptions.ufCrmTask = updatePayload.fields.ufCrmTask;
    }

    const updatedTask = await taskService.updateTask(
      updatePayload.id,
      updateOptions,
    );
    if (!updatedTask) {
      return NextResponse.json(
        { error: 'Не удалось обновить задачу' },
        { status: 500 },
      );
    }

    // Сохраняем обновленную задачу в БД
    console.log('💾 Сохранение обновленной задачи в БД...');
    const syncService = new BitrixSyncService(client);
    await syncService.saveTaskToDb(updatedTask, usersMap);
    console.log('✅ Задача сохранена в БД');

    const taskPayload = prepareTasksPayload([updatedTask], usersMap)[0];

    return NextResponse.json({ task: taskPayload });
  } catch (error) {
    console.error('❌ Tasks PATCH error:', error);
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Stack trace:', error.stack);
    }

    const errorMessage = error instanceof Error ? error.message : 'Не удалось обновить задачу';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('id');

    if (!taskId) {
      return NextResponse.json(
        { error: 'Параметр id обязателен' },
        { status: 400 },
      );
    }

    const { taskService } = await getTaskServiceContext(false);

    const deleted = await taskService.deleteTask(taskId);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Задача не удалена' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Tasks DELETE error:', error);
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Stack trace:', error.stack);
    }

    const errorMessage = error instanceof Error ? error.message : 'Не удалось удалить задачу';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}

async function getDepartmentContext() {
  const { taskService, departmentService, client } = await getBaseServices();

  const departmentName = await getConfiguredDepartmentName();
  const department = await departmentService.getDepartmentByName(
    departmentName,
  );
  if (!department) {
    throw new Error(`Департамент "${departmentName}" не найден`);
  }

  const userIds = await departmentService.getAllDepartmentUsers(department.ID);
  const usersList = await fetchUsers(client, userIds);
  const usersMap = buildUsersMap(usersList);

  return { taskService, department, userIds, usersList, usersMap, client };
}

async function getTaskServiceContext(withUsers = true) {
  const { taskService, client, departmentService } = await getBaseServices();
  const departmentName = await getConfiguredDepartmentName();
  const department = await departmentService.getDepartmentByName(
    departmentName,
  );

  let usersList: BitrixUser[] = [];
  let usersMap: UsersMap = {};

  if (withUsers && department) {
    const userIds = await departmentService.getAllDepartmentUsers(
      department.ID,
    );
    usersList = await fetchUsers(client, userIds);
    usersMap = buildUsersMap(usersList);
  }

  return {
    taskService,
    client,
    usersList,
    usersMap,
  };
}

async function getBaseServices() {
  const webhookUrl = await getConfiguredWebhookUrl();
  const client = new BitrixClient(webhookUrl);
  const taskService = new TaskService(client);
  const departmentService = new DepartmentService(client);

  return { client, taskService, departmentService };
}

async function fetchUsers(
  client: BitrixClient,
  userIds: string[],
): Promise<BitrixUser[]> {
  if (!userIds.length) {
    return [];
  }

  const users = await client.getAll<BitrixUser>('user.get', {
    filter: { ID: userIds },
  });

  return users.map((user: any) => ({
    ID: user.ID || user.id,
    NAME: user.NAME || user.name || '',
    LAST_NAME: user.LAST_NAME || user.lastName || '',
    EMAIL: user.EMAIL || user.email || '',
    WORK_POSITION: user.WORK_POSITION || user.workPosition || '',
    UF_DEPARTMENT: user.UF_DEPARTMENT || user.ufDepartment || [],
    ACTIVE:
      user.ACTIVE !== undefined
        ? user.ACTIVE
        : user.active !== undefined
          ? user.active
          : true,
  }));
}

function buildUsersMap(users: BitrixUser[]): UsersMap {
  return users.reduce<UsersMap>((acc, user) => {
    acc[user.ID] = {
      id: user.ID,
      name: `${user.NAME} ${user.LAST_NAME}`.trim(),
      email: user.EMAIL,
      position: user.WORK_POSITION,
      active: user.ACTIVE,
    };
    return acc;
  }, {});
}

function prepareTasksPayload(tasks: BitrixTask[], usersMap: UsersMap) {
  // Задачи уже дедуплицированы в TaskService.getAllTasks
  console.log(`📊 Обработка ${tasks.length} задач`);

  const mapped = tasks.map((task) => {
    const extended = attachMetadata(task);
    const user = usersMap[extended.RESPONSIBLE_ID];

    return {
      id: extended.ID,
      title: extended.TITLE,
      description: extended.DESCRIPTION ?? '',
      responsibleId: extended.RESPONSIBLE_ID,
      responsibleName: user?.name ?? '',
      status: extended.STATUS,
      statusName: statusCodeToName(extended.STATUS),
      deadline: extended.DEADLINE ?? null,
      inactiveDays: extended.inactiveDays ?? null,
      priorityLevel: extended.priority ?? 'normal',
      isOverdue: Boolean(extended.isOverdue),
      metadata: {
        manualPriority: extended.metadata.manualPriority ?? null,
        abc: extended.metadata.abc ?? null,
        impact: extended.metadata.impact ?? null,
        system: extended.metadata.system ?? null,
        p: extended.metadata.p ?? null,
        weight: extended.metadata.weight ?? null,
        departments: extended.metadata.departments ?? null, // Это уже названия
      },
      departments: [], // Будет заполнено при синхронизации с БД
      tags: Array.isArray(extended.TAGS) ? extended.TAGS : [],
      otherTags: extended.otherTags,
      raw: {
        createdDate: extended.CREATED_DATE,
        changedDate: extended.CHANGED_DATE,
        closedDate: extended.CLOSED_DATE,
      },
    };
  });

  const sorted = sortByManualPriority(mapped);
  return sorted.map((task, index) => ({
    ...task,
    order: index + 1,
  }));
}

async function reorderTasks(
  taskService: TaskService,
  tasks: ReorderPayload['tasks'],
) {
  // Drag-drop only affects visual order on the page, NOT manualPriority
  // manualPriority and P0-P3 priority remain unchanged
  for (const item of tasks) {
    const metadata: TaskMetadata = {
      ...(item.metadata ?? {}),
      // DO NOT update manualPriority here - it should remain unchanged
    };
    await taskService.updateTaskTags(item.id, item.otherTags ?? [], metadata);
  }
}

