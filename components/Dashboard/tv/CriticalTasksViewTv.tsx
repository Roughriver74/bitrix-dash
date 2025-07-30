'use client';

import { DashboardData } from '@/lib/bitrix/types';
import { AlertCircle, XCircle, Clock, User, Calendar } from 'lucide-react';

interface CriticalTasksViewTvProps {
  data: DashboardData;
}

export function CriticalTasksViewTv({ data }: CriticalTasksViewTvProps) {
  // Фильтруем критические и проблемные задачи
  const criticalTasks = data.tasks.filter(task => 
    task.priority === 'critical' || 
    task.isOverdue || 
    (task.inactiveDays !== undefined && task.inactiveDays > 5)
  );

  // Группируем задачи по типам проблем
  const overdueTasks = criticalTasks.filter(t => t.isOverdue);
  const stagnantTasks = criticalTasks.filter(t => t.inactiveDays !== undefined && t.inactiveDays > 5 && !t.isOverdue);
  const highPriorityTasks = criticalTasks.filter(t => 
    t.priority === 'critical' && !t.isOverdue && (t.inactiveDays === undefined || t.inactiveDays <= 5)
  );

  return (
    <div className="space-y-4">
      {/* Общая статистика */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-950 p-6 rounded-xl border border-red-600 border-opacity-20">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-red-600 bg-opacity-20 rounded-lg">
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
            <div>
              <p className="text-lg text-red-400">Всего критических</p>
              <p className="text-4xl font-bold text-white">{criticalTasks.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-red-950 p-6 rounded-xl border border-red-600 border-opacity-20">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-red-600 bg-opacity-20 rounded-lg">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <div>
              <p className="text-lg text-red-400">Просрочено</p>
              <p className="text-4xl font-bold text-white">{overdueTasks.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-950 p-6 rounded-xl border border-yellow-600 border-opacity-20">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-yellow-600 bg-opacity-20 rounded-lg">
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
            <div>
              <p className="text-lg text-yellow-400">Застоявшиеся</p>
              <p className="text-4xl font-bold text-white">{stagnantTasks.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-orange-950 p-6 rounded-xl border border-orange-600 border-opacity-20">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-orange-600 bg-opacity-20 rounded-lg">
              <AlertCircle className="h-8 w-8 text-orange-400" />
            </div>
            <div>
              <p className="text-lg text-orange-400">Высокий приоритет</p>
              <p className="text-4xl font-bold text-white">{highPriorityTasks.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Списки задач по категориям */}
      <div className="grid grid-cols-3 gap-4">
        {/* Просроченные задачи */}
        <div className="bg-gray-800 p-4 rounded-xl">
          <h3 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2">
            <XCircle className="h-6 w-6" />
            Просроченные задачи
          </h3>
          <div className="space-y-2">
            {overdueTasks.slice(0, 4).map(task => (
              <CriticalTaskCard key={task.ID} task={task} data={data} type="overdue" />
            ))}
            {overdueTasks.length === 0 && (
              <p className="text-gray-400 text-base">Нет просроченных задач</p>
            )}
          </div>
        </div>

        {/* Застоявшиеся задачи */}
        <div className="bg-gray-800 p-4 rounded-xl">
          <h3 className="text-xl font-bold text-yellow-400 mb-3 flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Без движения более 5 дней
          </h3>
          <div className="space-y-2">
            {stagnantTasks.slice(0, 4).map(task => (
              <CriticalTaskCard key={task.ID} task={task} data={data} type="stagnant" />
            ))}
            {stagnantTasks.length === 0 && (
              <p className="text-gray-400 text-base">Все задачи активны</p>
            )}
          </div>
        </div>

        {/* Высокоприоритетные */}
        <div className="bg-gray-800 p-4 rounded-xl">
          <h3 className="text-xl font-bold text-orange-400 mb-3 flex items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            Высокий приоритет
          </h3>
          <div className="space-y-2">
            {highPriorityTasks.slice(0, 4).map(task => (
              <CriticalTaskCard key={task.ID} task={task} data={data} type="priority" />
            ))}
            {highPriorityTasks.length === 0 && (
              <p className="text-gray-400 text-base">Нет задач с высоким приоритетом</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CriticalTaskCard({ task, data, type }: { task: any; data: any; type: 'overdue' | 'stagnant' | 'priority' }) {
  const user = data.users.find((u: any) => 
    (u.ID === task.RESPONSIBLE_ID) || (u.id === task.RESPONSIBLE_ID)
  );
  
  const userName = user ? (user.name || `${user.NAME} ${user.LAST_NAME}`.trim()) : 'Не назначен';
  
  const typeStyles = {
    overdue: 'bg-red-900 border-red-600',
    stagnant: 'bg-yellow-900 border-yellow-600',
    priority: 'bg-orange-900 border-orange-600'
  };

  return (
    <div className={`
      p-3 rounded-lg border border-opacity-50
      ${typeStyles[type]}
    `}>
      <h4 className="font-semibold text-white text-sm mb-1 line-clamp-1">
        {task.TITLE}
      </h4>
      
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-1 text-gray-300">
          <User className="h-3 w-3" />
          <span className="truncate">{userName}</span>
        </div>
        
        {task.DEADLINE && (
          <div className="flex items-center gap-1 text-gray-300">
            <Calendar className="h-3 w-3" />
            <span>Дедлайн: {new Date(task.DEADLINE).toLocaleDateString('ru-RU')}</span>
          </div>
        )}
        
        {type === 'overdue' && task.DEADLINE && (
          <div className="text-red-400 font-medium">
            Просрочено на {Math.abs(Math.floor((new Date().getTime() - new Date(task.DEADLINE).getTime()) / (1000 * 60 * 60 * 24)))} дн.
          </div>
        )}
        
        {type === 'stagnant' && (
          <div className="text-yellow-400 font-medium">
            Без активности: {task.inactiveDays || 0} дн.
          </div>
        )}
      </div>
    </div>
  );
}