'use client';

import { useState } from 'react';
import { BitrixTask, BitrixUser, UserAbsenceInfo } from '@/lib/bitrix/types';
import { ChevronDown, ChevronUp, AlertTriangle, AlertOctagon, Calendar, Clock } from 'lucide-react';

interface TasksTableProps {
  tasks: BitrixTask[];
  users: BitrixUser[];
  absences?: Record<string, UserAbsenceInfo>;
}

export function TasksTable({ tasks, users, absences = {} }: TasksTableProps) {
  const [sortField, setSortField] = useState<keyof BitrixTask>('inactiveDays');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');

  const getUserName = (userId: string) => {
    const user = users.find(u => u.ID === userId);
    return user ? `${user.NAME} ${user.LAST_NAME}` : 'Не назначен';
  };

  const handleSort = (field: keyof BitrixTask) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filterStatus !== 'all' && task.priority !== filterStatus) return false;
    if (filterUser !== 'all' && task.RESPONSIBLE_ID !== filterUser) return false;
    return true;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aValue = a[sortField] || '';
    const bValue = b[sortField] || '';
    
    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">Задачи отдела</h2>
        
        <div className="mt-4 flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          >
            <option value="all">Все приоритеты</option>
            <option value="normal">Обычные</option>
            <option value="warning">Требуют внимания</option>
            <option value="critical">Критические</option>
          </select>
          
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          >
            <option value="all">Все сотрудники</option>
            {users.map(user => (
              <option key={user.ID} value={user.ID}>
                {user.NAME} {user.LAST_NAME}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('TITLE')}
              >
                <div className="flex items-center">
                  Задача
                  {sortField === 'TITLE' && (
                    sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                  )}
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('RESPONSIBLE_ID')}
              >
                <div className="flex items-center">
                  Ответственный
                  {sortField === 'RESPONSIBLE_ID' && (
                    sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Статус
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('inactiveDays')}
              >
                <div className="flex items-center">
                  Дней без активности
                  {sortField === 'inactiveDays' && (
                    sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                В работе
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Приоритет
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTasks.map((task) => (
              <tr key={task.ID} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="max-w-xs">
                    <div className="text-sm font-medium text-gray-900 truncate" title={task.TITLE}>
                      {task.TITLE}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {task.ID}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    {getUserName(task.RESPONSIBLE_ID)}
                    {absences[task.RESPONSIBLE_ID]?.isAbsent && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                        <Calendar className="mr-1 h-3 w-3" />
                        Отсутствует
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className={`
                    ${task.isInProgress ? 'font-medium text-blue-600' : ''}
                  `}>
                    {statusMap[task.STATUS] || 'Неизвестно'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.inactiveDays} дней
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {task.isInProgress && task.executionTime !== undefined && (
                    <div className="flex items-center gap-1 text-blue-600">
                      <Clock className="h-3 w-3" />
                      <span>{task.executionTime} дн.</span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {task.priority === 'critical' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <AlertOctagon className="mr-1 h-3 w-3" />
                      Критический
                    </span>
                  )}
                  {task.priority === 'warning' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Внимание
                    </span>
                  )}
                  {task.priority === 'normal' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Обычный
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}