import { BitrixClient } from '@/lib/bitrix/client';
import { prisma } from '@/lib/prisma';
import { normalizeSystemName } from '@/lib/tasks/systems';
import { BitrixTask } from '@/lib/bitrix/types';
import { mergeTagsWithMetadata } from '@/lib/tasks/metadata';
import { TaskService } from '@/lib/bitrix/services/TaskService';

export class BitrixSyncService {
  constructor(private client: BitrixClient) {}

  private readonly LOAD_SCRUM_WEIGHTS = process.env.LOAD_SCRUM_WEIGHTS === 'true';

  async syncAllTasks(userIds: string[]) {
    console.log(`🔄 Starting full sync for ${userIds.length} users...`);
    
    // 0. Fetch users to get names
    const users = await this.client.getAll<any>('user.get', {
      filter: { ID: userIds },
    });
    const usersMap = new Map<string, string>();
    users.forEach(u => {
      usersMap.set(u.ID, `${u.NAME} ${u.LAST_NAME}`.trim());
    });
    
    // 1. Fetch all tasks from Bitrix
    const { activeTasks, completedTasks } = await this.getAllTasksFromBitrix(userIds);
    const allTasks = [...activeTasks, ...completedTasks];
    
    console.log(`📥 Fetched ${allTasks.length} tasks from Bitrix. Saving to DB...`);

    // 2. Save to SQLite
    await this.saveTasksToDb(allTasks, usersMap);
    
    // 3. Удаляем задачи, которые больше не существуют в Битриксе
    await this.removeDeletedTasks(allTasks, userIds);
    
    console.log(`✅ Sync complete.`);
  }

  private async getAllTasksFromBitrix(userIds: string[]) {
    // Reuse logic from TaskService to fetch tasks, tags, scrum data, etc.
    // For brevity, I'll implement a simplified version here that calls the existing TaskService methods if possible,
    // or reimplements the core fetching logic.
    // Since TaskService is complex, let's reimplement the core fetching logic here to ensure we get raw data + enrichments.
    
    const userChunks = this.chunkArray(userIds, 10);
    const allActiveTasks: BitrixTask[] = [];
    const allCompletedTasks: BitrixTask[] = [];
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const chunk of userChunks) {
      // Active tasks
      const activeTasksRaw = await this.client.getAllTasks(
        { RESPONSIBLE_ID: chunk },
        ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'UF_CRM_TASK', 'TAGS']
      );
      
      const activeTasks = activeTasksRaw.filter((task: any) => {
        const status = String(task.STATUS || task.status || '');
        return status !== '5' && status !== '6';
      });
      
      allActiveTasks.push(...activeTasks);

      // Completed tasks
      const completedTasks = await this.client.getAllTasks(
        {
          RESPONSIBLE_ID: chunk,
          STATUS: 5,
          '>=CLOSED_DATE': thirtyDaysAgo.toISOString()
        },
        ['ID', 'TITLE', 'DESCRIPTION', 'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'STATUS', 'PRIORITY', 'GROUP_ID', 'UF_CRM_TASK', 'TAGS']
      );
      allCompletedTasks.push(...completedTasks);
    }

    // Deduplicate
    const uniqueActive = this.deduplicate(allActiveTasks);
    const uniqueCompleted = this.deduplicate(allCompletedTasks);

    // Enrich (Tags, Scrum, Groups) - we need this to populate our DB fields
    // We can reuse the logic from TaskService if we instantiate it, or copy it.
    // Let's copy the essential parts to keep this service self-contained but consistent.
    
    const enrichedActive = await this.enrichTasks(uniqueActive);
    const enrichedCompleted = await this.enrichTasks(uniqueCompleted);

    return { activeTasks: enrichedActive, completedTasks: enrichedCompleted };
  }

  private async saveTasksToDb(tasks: BitrixTask[], usersMap: Map<string, string>) {
    for (const task of tasks) {
      const taskAny = task as any;
      const id = String(taskAny.id || taskAny.ID);
      
      // Extract metadata from tags
      let tagsRaw = taskAny.tags || taskAny.TAGS || [];
      if (!Array.isArray(tagsRaw)) {
          // Handle object-like array from Bitrix if necessary, or just empty
          // console.warn('⚠️ Tags is not an array for task', id, tagsRaw);
          tagsRaw = [];
      }
      const tags: string[] = tagsRaw;

      const metadata = this.extractMetadataFromTags(tags);
      
      // Extract system
      let systemName = metadata.system;
      if (!systemName) {
         // Fallback logic is already applied in enrichTasks, so metadata.system should be populated if available
      }

      // Upsert System
      let systemId = null;
      if (systemName) {
        const system = await prisma.system.upsert({
          where: { name: systemName },
          update: {},
          create: { name: systemName },
        });
        systemId = system.id;
      }

      // Upsert User
      const responsibleId = String(taskAny.responsibleId || taskAny.RESPONSIBLE_ID);
      const responsibleName = usersMap.get(responsibleId) || taskAny.responsibleName || 'Unknown';
      
      await prisma.user.upsert({
          where: { id: responsibleId },
          update: { name: responsibleName },
          create: { id: responsibleId, name: responsibleName }
      });

      // Upsert Priority
      let priorityId = null;
      if (metadata.p) {
          const priority = await prisma.priority.upsert({
              where: { name: metadata.p },
              update: {},
              create: { name: metadata.p }
          });
          priorityId = priority.id;
      }

      // Upsert Abc
      let abcId = null;
      if (metadata.abc) {
          const abc = await prisma.abc.upsert({
              where: { name: metadata.abc },
              update: {},
              create: { name: metadata.abc }
          });
          abcId = abc.id;
      }

      // Upsert Impact
      let impactId = null;
      if (metadata.impact) {
          const impact = await prisma.impact.upsert({
              where: { name: metadata.impact },
              update: {},
              create: { name: metadata.impact }
          });
          impactId = impact.id;
      }

      // Upsert Task
      await prisma.task.upsert({
        where: { id },
        update: {
          title: taskAny.title || taskAny.TITLE,
          description: taskAny.description || taskAny.DESCRIPTION,
          responsibleId: responsibleId,
          responsibleName: responsibleName,
          status: String(taskAny.status || taskAny.STATUS),
          statusName: taskAny.statusName,
          deadline: taskAny.deadline || taskAny.DEADLINE ? new Date(taskAny.deadline || taskAny.DEADLINE) : null,
          createdDate: taskAny.createdDate || taskAny.CREATED_DATE ? new Date(taskAny.createdDate || taskAny.CREATED_DATE) : null,
          changedDate: taskAny.changedDate || taskAny.CHANGED_DATE ? new Date(taskAny.changedDate || taskAny.CHANGED_DATE) : null,
          closedDate: taskAny.closedDate || taskAny.CLOSED_DATE ? new Date(taskAny.closedDate || taskAny.CLOSED_DATE) : null,
          groupId: String(taskAny.groupId || taskAny.GROUP_ID || ''),
          groupName: taskAny.groupName,
          priorityId: priorityId,
          abcId: abcId,
          impactId: impactId,
          weight: metadata.weight,
          systemId: systemId,
          order: taskAny.order || 0,
          updatedAt: new Date(),
        },
        create: {
          id,
          title: taskAny.title || taskAny.TITLE,
          description: taskAny.description || taskAny.DESCRIPTION,
          responsibleId: responsibleId,
          responsibleName: responsibleName,
          status: String(taskAny.status || taskAny.STATUS),
          statusName: taskAny.statusName,
          deadline: taskAny.deadline || taskAny.DEADLINE ? new Date(taskAny.deadline || taskAny.DEADLINE) : null,
          createdDate: taskAny.createdDate || taskAny.CREATED_DATE ? new Date(taskAny.createdDate || taskAny.CREATED_DATE) : null,
          changedDate: taskAny.changedDate || taskAny.CHANGED_DATE ? new Date(taskAny.changedDate || taskAny.CHANGED_DATE) : null,
          closedDate: taskAny.closedDate || taskAny.CLOSED_DATE ? new Date(taskAny.closedDate || taskAny.CLOSED_DATE) : null,
          groupId: String(taskAny.groupId || taskAny.GROUP_ID || ''),
          groupName: taskAny.groupName,
          priorityId: priorityId,
          abcId: abcId,
          impactId: impactId,
          weight: metadata.weight,
          systemId: systemId,
          order: 0,
        },
      });

      // Handle Tags
      // First delete existing tags for this task
      await prisma.taskTag.deleteMany({ where: { taskId: id } });
      
      for (const tagName of tags) {
        // Upsert Tag
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        
        // Link Tag to Task
        await prisma.taskTag.create({
          data: {
            taskId: id,
            tagId: tag.id,
          },
        });
      }

      // Handle Departments
      // First delete existing department links for this task
      await prisma.taskDepartment.deleteMany({ where: { taskId: id } });
      
      if (metadata.departments && Array.isArray(metadata.departments)) {
        // metadata.departments теперь содержит названия отделов, а не ID
        const departmentNames = metadata.departments;
        
        for (const deptName of departmentNames) {
          try {
            // Ищем отдел по названию или создаем новый
            const department = await prisma.department.upsert({
              where: { name: deptName },
              update: {},
              create: { 
                id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: deptName 
              },
            });
            
            // Link Department to Task
            await prisma.taskDepartment.create({
              data: {
                taskId: id,
                departmentId: department.id,
              },
            });
          } catch (error) {
            console.warn(`⚠️ Failed to link department "${deptName}" to task ${id}:`, error);
          }
        }
      }
    }
  }

  // Кэш для информации об отделах
  private departmentCache = new Map<string, { name: string }>();

  /**
   * Получает информацию об отделе (с кэшированием)
   */
  private async getDepartmentInfo(departmentId: string): Promise<{ name: string } | null> {
    // Проверяем кэш
    if (this.departmentCache.has(departmentId)) {
      return this.departmentCache.get(departmentId)!;
    }

    try {
      // Загружаем все отделы один раз
      if (this.departmentCache.size === 0) {
        const allDepartments = await this.client.call<any[]>('department.get');
        this.flattenAndCacheDepartments(allDepartments);
      }

      return this.departmentCache.get(departmentId) || null;
    } catch (error) {
      console.error(`❌ Failed to get department info for ${departmentId}:`, error);
      return null;
    }
  }

  /**
   * Рекурсивно обходит дерево отделов и кэширует их
   */
  private flattenAndCacheDepartments(departments: any[]) {
    for (const dept of departments) {
      this.departmentCache.set(dept.ID, { name: dept.NAME });
      
      if (dept.CHILDREN && Array.isArray(dept.CHILDREN)) {
        this.flattenAndCacheDepartments(dept.CHILDREN);
      }
    }
  }

  // --- Helper methods (simplified from TaskService) ---

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  }

  private deduplicate(tasks: BitrixTask[]): BitrixTask[] {
    return Array.from(new Map(tasks.filter(t => (t as any).ID).map(t => [(t as any).ID, t])).values());
  }

  private extractMetadataFromTags(tags: string[]) {
    // Simplified extraction logic
    const metadata: any = {};
    if (!Array.isArray(tags)) {
        // console.warn('⚠️ extractMetadataFromTags: tags is not an array:', tags);
        return metadata;
    }
    
    tags.forEach(tag => {
      const lower = tag.toLowerCase();
      if (lower.startsWith('abc:')) metadata.abc = tag.split(':')[1];
      if (lower.startsWith('priority:')) metadata.weight = parseFloat(tag.split(':')[1]); // Legacy?
      if (lower.startsWith('weight:')) metadata.weight = parseFloat(tag.split(':')[1]);
      if (lower.startsWith('impact:')) metadata.impact = tag.split(':')[1];
      if (lower.startsWith('system:')) metadata.system = tag.split(':')[1];
      if (lower.startsWith('p:')) metadata.p = tag.split(':')[1];
      if (lower.startsWith('departments:')) {
        const value = tag.split(':')[1];
        if (value) {
          metadata.departments = value.split(',').map(name => name.trim()).filter(name => name.length > 0);
        }
      }
    });

    return metadata;
  }

  // This should ideally be shared or imported, but for now I'll stub the enrichment 
  // to just return tasks as-is or with minimal processing, 
  // relying on the fact that we might want to move the heavy lifting to the sync process eventually.
  // For now, let's assume we need to replicate the full enrichment to get System/Group names.
  
  private async enrichTasks(tasks: BitrixTask[]): Promise<BitrixTask[]> {
    const taskService = new TaskService(this.client);
    return await taskService.enrichTasksData(tasks);
  }

  /**
   * Удаляет задачи из БД, которые больше не существуют в Битриксе
   */
  private async removeDeletedTasks(bitrixTasks: BitrixTask[], userIds: string[]) {
    // Получаем ID всех задач из Битрикса
    const bitrixTaskIds = new Set(
      bitrixTasks.map(task => String((task as any).id || (task as any).ID))
    );
    
    // Получаем все задачи из БД для этих пользователей
    const dbTasks = await prisma.task.findMany({
      where: {
        responsibleId: {
          in: userIds
        }
      },
      select: {
        id: true
      }
    });
    
    // Находим задачи, которые есть в БД, но нет в Битриксе
    const tasksToDelete = dbTasks.filter(task => !bitrixTaskIds.has(task.id));
    
    if (tasksToDelete.length > 0) {
      console.log(`🗑️  Удаляем ${tasksToDelete.length} задач, которые больше не существуют в Битриксе...`);
      
      // Удаляем задачи (каскадное удаление связей настроено в схеме)
      await prisma.task.deleteMany({
        where: {
          id: {
            in: tasksToDelete.map(t => t.id)
          }
        }
      });
      
      console.log(`✅ Удалено ${tasksToDelete.length} задач`);
      
      // Очищаем неиспользуемые теги (теги без задач)
      const unusedTags = await prisma.tag.findMany({
        where: {
          tasks: {
            none: {}
          }
        }
      });
      
      if (unusedTags.length > 0) {
        await prisma.tag.deleteMany({
          where: {
            id: {
              in: unusedTags.map(t => t.id)
            }
          }
        });
        console.log(`🧹 Очищено ${unusedTags.length} неиспользуемых тегов`);
      }
      
      // Очищаем неиспользуемые отделы (только созданные вручную, начинающиеся с custom_)
      const unusedDepartments = await prisma.department.findMany({
        where: {
          AND: [
            { id: { startsWith: 'custom_' } },
            { tasks: { none: {} } }
          ]
        }
      });
      
      if (unusedDepartments.length > 0) {
        await prisma.department.deleteMany({
          where: {
            id: {
              in: unusedDepartments.map(d => d.id)
            }
          }
        });
        console.log(`🧹 Очищено ${unusedDepartments.length} неиспользуемых отделов`);
      }
    } else {
      console.log(`✅ Нет задач для удаления`);
    }
  }

  /**
   * Сохраняет одну задачу в БД (публичный метод для обновления после изменения)
   */
  async saveTaskToDb(task: BitrixTask, usersMap: Map<string, string> | Record<string, { name: string }> = new Map()): Promise<void> {
    // Преобразуем usersMap в Map, если это объект
    let usersMapConverted: Map<string, string>;
    if (usersMap instanceof Map) {
      usersMapConverted = usersMap;
    } else {
      usersMapConverted = new Map(
        Object.entries(usersMap).map(([id, user]) => [id, user.name])
      );
    }
    await this.saveTasksToDb([task], usersMapConverted);
  }
}
