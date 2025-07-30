'use client';

import { useState, useEffect } from 'react';
import { DashboardData } from '@/lib/bitrix/types';
import { User, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface PersonalViewTvProps {
  data: DashboardData;
}

export function PersonalViewTv({ data }: PersonalViewTvProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Добавляем статистику для каждого пользователя
  const usersWithStats = data.users.map(user => {
    const userId = user.ID || user.id;
    const userName = user.name || `${user.NAME} ${user.LAST_NAME}`.trim();
    
    const userTasks = data.tasks.filter(task => task.RESPONSIBLE_ID === userId);
    const completedTasks = data.completedTasks.filter(task => task.RESPONSIBLE_ID === userId);
    
    const stats = {
      active: userTasks.length,
      critical: userTasks.filter(t => t.priority === 'critical').length,
      warning: userTasks.filter(t => t.priority === 'warning').length,
      completed: completedTasks.length,
      overdue: userTasks.filter(t => t.isOverdue).length,
      avgCompletionTime: calculateAvgCompletionTime(completedTasks)
    };
    
    return { 
      ...user, 
      id: userId,
      name: userName,
      NAME: userName,
      stats, 
      tasks: userTasks 
    };
  });

  // Автоматическая смена сотрудника каждые 10 секунд
  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedIndex((prev) => (prev + 1) % usersWithStats.length);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [usersWithStats.length]);

  const selectedUser = usersWithStats[selectedIndex];

  return (
    <div className="space-y-6">
      {/* Список сотрудников */}
      <div className="grid grid-cols-6 gap-3">
        {usersWithStats.map((user, index) => (
          <button
            key={user.id}
            onClick={() => setSelectedIndex(index)}
            className={`
              p-3 rounded-lg transition-all
              ${index === selectedIndex 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <User className="h-6 w-6" />
              <div className="text-left">
                <div className="font-semibold text-base">{user.NAME}</div>
                <div className="text-xs opacity-80">
                  {user.stats.active} задач
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Детальная информация по выбранному сотруднику */}
      <div className="bg-gray-800 p-6 rounded-xl">
        <h2 className="text-2xl font-bold text-white mb-4">{selectedUser.NAME}</h2>
        
        {/* Статистика сотрудника */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <StatCard
            title="Активные задачи"
            value={selectedUser.stats.active}
            icon={Clock}
            color="blue"
          />
          <StatCard
            title="Критические"
            value={selectedUser.stats.critical}
            icon={AlertTriangle}
            color="red"
          />
          <StatCard
            title="Требуют внимания"
            value={selectedUser.stats.warning}
            icon={AlertTriangle}
            color="yellow"
          />
          <StatCard
            title="Выполнено за 30 дней"
            value={selectedUser.stats.completed}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="Просрочено"
            value={selectedUser.stats.overdue}
            icon={AlertTriangle}
            color="red"
          />
        </div>

        {/* Список задач сотрудника */}
        <div className="space-y-3">
          <h3 className="text-xl font-semibold text-white mb-3">Активные задачи</h3>
          <div className="grid gap-2">
            {selectedUser.tasks.slice(0, 4).map(task => (
              <TaskRow key={task.ID} task={task} />
            ))}
          </div>
          {selectedUser.tasks.length > 4 && (
            <p className="text-gray-400 text-base mt-2">
              И еще {selectedUser.tasks.length - 4} задач...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: 'blue' | 'red' | 'yellow' | 'green' }) {
  const colors = {
    blue: 'bg-blue-950 text-blue-400 border-blue-600',
    red: 'bg-red-950 text-red-400 border-red-600',
    yellow: 'bg-yellow-950 text-yellow-400 border-yellow-600',
    green: 'bg-green-950 text-green-400 border-green-600'
  };

  return (
    <div className={`${colors[color]} p-4 rounded-lg border border-opacity-20`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-6 w-6" />
        <span className="text-sm">{title}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-900 border-red-600 text-red-300',
    warning: 'bg-yellow-900 border-yellow-600 text-yellow-300',
    normal: 'bg-gray-700 border-gray-600 text-gray-300'
  };

  const priority = task.priority || 'normal';

  return (
    <div className={`
      p-3 rounded-lg border border-opacity-50
      ${priorityColors[priority] || priorityColors.normal}
    `}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-semibold text-white text-base line-clamp-1">{task.TITLE}</h4>
          <div className="flex gap-3 mt-1 text-xs">
            {task.DEADLINE && (
              <span>Дедлайн: {new Date(task.DEADLINE).toLocaleDateString('ru-RU')}</span>
            )}
            {task.inactiveDays > 0 && (
              <span className="text-yellow-400">
                Без активности: {task.inactiveDays} дн.
              </span>
            )}
          </div>
        </div>
        {task.isOverdue && (
          <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-medium">
            Просрочено
          </span>
        )}
      </div>
    </div>
  );
}

function calculateAvgCompletionTime(tasks: any[]): number {
  if (tasks.length === 0) return 0;
  
  const completionTimes = tasks
    .filter(task => task.CREATED_DATE && task.CLOSED_DATE)
    .map(task => {
      const created = new Date(task.CREATED_DATE).getTime();
      const closed = new Date(task.CLOSED_DATE).getTime();
      return (closed - created) / (1000 * 60 * 60 * 24); // дни
    });
  
  if (completionTimes.length === 0) return 0;
  
  return Math.round(
    completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
  );
}