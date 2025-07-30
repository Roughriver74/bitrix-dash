'use client';

import { useState, useEffect } from 'react';
import { BitrixTask, BitrixUser } from '@/lib/bitrix/types';
import { AlertTriangle, AlertOctagon } from 'lucide-react';

interface TasksTableTvProps {
  tasks: BitrixTask[];
  users: BitrixUser[];
}

export function TasksTableTv({ tasks, users }: TasksTableTvProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const tasksPerPage = 8; // Уменьшаем для TV экрана

  const getUserName = (userId: string) => {
    const user = users.find(u => (u.ID === userId) || (u.id === userId));
    if (!user) return 'Не назначен';
    return user.name || `${user.NAME} ${user.LAST_NAME}`.trim();
  };

  // Сортируем задачи по приоритету и дням неактивности
  const sortedTasks = [...tasks].sort((a, b) => {
    // Сначала критические
    if (a.priority === 'critical' && b.priority !== 'critical') return -1;
    if (a.priority !== 'critical' && b.priority === 'critical') return 1;
    
    // Затем предупреждения
    if (a.priority === 'warning' && b.priority === 'normal') return -1;
    if (a.priority === 'normal' && b.priority === 'warning') return 1;
    
    // Внутри категории сортируем по дням неактивности
    return (b.inactiveDays || 0) - (a.inactiveDays || 0);
  });

  const totalPages = Math.ceil(sortedTasks.length / tasksPerPage);
  const currentTasks = sortedTasks.slice(
    currentPage * tasksPerPage,
    (currentPage + 1) * tasksPerPage
  );

  // Автоматическая смена страниц каждые 10 секунд
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, 10000);

    return () => clearInterval(interval);
  }, [totalPages]);

  const statusMap: Record<string, string> = {
    '1': 'Новая',
    '2': 'Ждет выполнения',
    '3': 'Выполняется',
    '4': 'Ждет контроля',
    '5': 'Завершена',
    '6': 'Отложена',
    '7': 'Отклонена'
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700">
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-white">Задачи отдела</h2>
          <div className="text-gray-400">
            Страница {currentPage + 1} из {totalPages}
          </div>
        </div>
      </div>

      <div className="overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                Задача
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                Ответственный
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-300 uppercase tracking-wider">
                Без активности
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-300 uppercase tracking-wider">
                Приоритет
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {currentTasks.map((task) => (
              <tr key={task.ID} className="hover:bg-gray-700 transition-colors">
                <td className="px-4 py-3">
                  <div className="max-w-lg">
                    <div className="text-base font-medium text-white truncate" title={task.TITLE}>
                      {task.TITLE}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-base text-gray-300 truncate max-w-xs">
                  {getUserName(task.RESPONSIBLE_ID)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-base font-bold ${
                    task.inactiveDays && task.inactiveDays >= 7 ? 'text-red-400' : 
                    task.inactiveDays && task.inactiveDays >= 3 ? 'text-yellow-400' : 
                    'text-green-400'
                  }`}>
                    {task.inactiveDays || 0} дн.
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {task.priority === 'critical' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900 text-red-200">
                      <AlertOctagon className="mr-1 h-4 w-4" />
                      Критич.
                    </span>
                  )}
                  {task.priority === 'warning' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-900 text-yellow-200">
                      <AlertTriangle className="mr-1 h-4 w-4" />
                      Внимание
                    </span>
                  )}
                  {task.priority === 'normal' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900 text-green-200">
                      Обычный
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-gray-700">
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => (
            <div
              key={i}
              className={`h-2 w-8 rounded-full transition-colors ${
                i === currentPage ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}