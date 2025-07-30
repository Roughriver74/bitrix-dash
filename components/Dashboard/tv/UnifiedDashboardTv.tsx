'use client';

import { useState, useEffect } from 'react';
import { DashboardData } from '@/lib/bitrix/types';
import { TrendingUp, TrendingDown, Clock, User, CheckCircle, AlertTriangle, Calendar, Activity, ChevronLeft, ChevronRight, Timer, Gauge, CalendarOff, PlayCircle } from 'lucide-react';

interface UnifiedDashboardTvProps {
  data: DashboardData;
}

interface EmployeeMetrics {
  id: string;
  name: string;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  avgInactiveDays: number;
  rating: number;
  tasks: any[];
  avgCompletionTime: number;
  completionTimeTrend: number;
  efficiency: number;
  efficiencyTrend: number;
  completionRate: number;
  completionRateTrend: number;
  isAbsent?: boolean;
  futureAbsence?: {
    dateFrom: string;
    dateTo: string;
    eventName: string;
    daysUntil: number;
  };
  inProgressTasks: number;
}

export function UnifiedDashboardTv({ data }: UnifiedDashboardTvProps) {
  const [selectedEmployeeIndex, setSelectedEmployeeIndex] = useState<number | null>(null);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [secondsUntilSwitch, setSecondsUntilSwitch] = useState(15);


  // Расчет метрик для сотрудников
  const activeEmployees: (EmployeeMetrics | null)[] = data.users
    .map(user => {
      const userId = user.ID || user.id;
      if (!userId) return null; // Пропускаем пользователей без ID
      
      const userName = user.name || `${user.NAME} ${user.LAST_NAME}`.trim();
      const absenceInfo = data.absences?.[userId];
      
      const activeTasks = data.tasks.filter(task => task.RESPONSIBLE_ID === userId);
      const completedTasks = data.completedTasks.filter(task => task.RESPONSIBLE_ID === userId);
      const inProgressTasks = activeTasks.filter(task => task.isInProgress);
      
      // Пропускаем сотрудников без задач (активных и завершенных)
      if (activeTasks.length === 0 && completedTasks.length === 0) {
        return null;
      }
      
      // Расчет средней скорости выполнения за последние 30 дней
      const completedLast30Days = completedTasks.filter(task => {
        const closedDate = task.CLOSED_DATE;
        if (!closedDate) return false;
        const closedDateObj = new Date(closedDate);
        const daysDiff = (Date.now() - closedDateObj.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30;
      });
      
      // Логирование для отладки
      if (userId === data.users[0]?.ID || userId === data.users[0]?.id) {
        console.log(`Сотрудник ${userName}:`, {
          userId,
          completedTasks: completedTasks.length,
          completedLast30Days: completedLast30Days.length,
          completedTaskExample: completedTasks[0]
        });
      }

      const avgCompletionTime = calculateAvgCompletionTime(completedLast30Days);
      const avgCompletionTime7Days = calculateAvgCompletionTime(
        completedLast30Days.filter(task => {
          const closedDate = task.CLOSED_DATE;
          if (!closedDate) return false;
          const closedDateObj = new Date(closedDate);
          const daysDiff = (Date.now() - closedDateObj.getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff <= 7;
        })
      );
      
      // Тренд скорости выполнения (положительный - быстрее)
      const completionTimeTrend = avgCompletionTime7Days > 0 && avgCompletionTime > 0
        ? ((avgCompletionTime - avgCompletionTime7Days) / avgCompletionTime) * 100
        : 0;

      // Эффективность: процент задач выполненных вовремя
      const tasksCompletedOnTime = completedLast30Days.filter(task => {
        const deadline = task.DEADLINE;
        const closedDate = task.CLOSED_DATE;
        if (!deadline || !closedDate) return true; // Если нет дедлайна, считаем выполненной вовремя
        return new Date(closedDate) <= new Date(deadline);
      }).length;
      
      const efficiency = completedLast30Days.length > 0 
        ? Math.round((tasksCompletedOnTime / completedLast30Days.length) * 100)
        : 100;

      // Тренд эффективности
      const efficiency7Days = calculateEfficiency(
        completedLast30Days.filter(task => {
          const closedDate = task.CLOSED_DATE;
          if (!closedDate) return false;
          const closedDateObj = new Date(closedDate);
          const daysDiff = (Date.now() - closedDateObj.getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff <= 7;
        })
      );
      const efficiencyTrend = efficiency7Days - efficiency;

      // Процент выполнения
      const totalTasksCount = activeTasks.length + completedLast30Days.length;
      const completionRate = totalTasksCount > 0
        ? Math.round((completedLast30Days.length / totalTasksCount) * 100)
        : 0;

      // Тренд процента выполнения
      const completed7Days = completedLast30Days.filter(task => {
        if (!task.CLOSED_DATE) return false;
        const closedDate = new Date(task.CLOSED_DATE);
        const daysDiff = (Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
      }).length;
      const completionRate7Days = totalTasksCount > 0
        ? Math.round((completed7Days / totalTasksCount) * 100)
        : 0;
      const completionRateTrend = completionRate7Days - completionRate;

      // Рассчитываем рейтинг
      const overdueTasks = activeTasks.filter(t => t.isOverdue).length;
      const avgInactiveDays = activeTasks.length > 0 
        ? activeTasks.reduce((sum, t) => sum + (t.inactiveDays || 0), 0) / activeTasks.length
        : 0;
      
      // Улучшенная формула рейтинга - более справедливая
      const rating = Math.max(0, 
        completedLast30Days.length * 15 +  // Больше баллов за выполненные задачи
        Math.floor(efficiency / 5) -        // Больше бонуса за эффективность
        overdueTasks * 5 -                  // Меньший штраф за просроченные
        Math.floor(avgInactiveDays) * 1     // Меньший штраф за неактивность
      );
      
      
      return {
        id: userId,
        name: userName,
        activeTasks: activeTasks.length,
        completedTasks: completedLast30Days.length,
        overdueTasks,
        avgInactiveDays: Math.round(avgInactiveDays),
        rating,
        tasks: activeTasks.sort((a, b) => {
          // Сначала задачи в работе
          if (a.isInProgress && !b.isInProgress) return -1;
          if (!a.isInProgress && b.isInProgress) return 1;
          // Затем по дням неактивности
          return (b.inactiveDays || 0) - (a.inactiveDays || 0);
        }),
        avgCompletionTime,
        completionTimeTrend,
        efficiency,
        efficiencyTrend,
        completionRate,
        completionRateTrend,
        isAbsent: absenceInfo?.isAbsent,
        futureAbsence: absenceInfo?.futureAbsence,
        inProgressTasks: inProgressTasks.length
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.rating - a!.rating);


  // Автоматическое переключение: общий вид -> сотрудник 1 -> сотрудник 2 -> ... -> общий вид
  useEffect(() => {
    if (!autoSwitch) return;
    
    // Сбрасываем таймер при переключении
    setSecondsUntilSwitch(15);
    
    // Таймер обратного отсчета
    const countdownInterval = setInterval(() => {
      setSecondsUntilSwitch(prev => {
        if (prev <= 1) {
          // Переключаем вид
          setSelectedEmployeeIndex(current => {
            // Если показываем общий вид (null), переходим к первому сотруднику
            if (current === null) return 0;
            // Если дошли до последнего сотрудника, возвращаемся к общему виду
            if (current >= activeEmployees.length - 1) return null;
            // Иначе переходим к следующему сотруднику
            return current + 1;
          });
          return 15; // Сбрасываем таймер
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(countdownInterval);
  }, [autoSwitch, activeEmployees.length, selectedEmployeeIndex]);

  // Задачи текущего сотрудника или все задачи
  const displayTasks = selectedEmployeeIndex !== null && activeEmployees[selectedEmployeeIndex]
    ? activeEmployees[selectedEmployeeIndex]!.tasks
    : data.tasks
        .filter(task => {
          const employee = activeEmployees.find(e => e?.id === task.RESPONSIBLE_ID);
          return employee !== undefined;
        })
        .sort((a, b) => {
          // Сначала задачи в работе
          if (a.isInProgress && !b.isInProgress) return -1;
          if (!a.isInProgress && b.isInProgress) return 1;
          // Затем по дням неактивности
          return (b.inactiveDays || 0) - (a.inactiveDays || 0);
        });

  // Расчет общих метрик по отделу
  const departmentStats = {
    totalActiveTasks: activeEmployees.reduce((sum, e) => sum + (e?.activeTasks || 0), 0),
    totalCompletedTasks: activeEmployees.reduce((sum, e) => sum + (e?.completedTasks || 0), 0),
    totalInProgressTasks: activeEmployees.reduce((sum, e) => sum + (e?.inProgressTasks || 0), 0),
    avgCompletionTime: activeEmployees.length > 0
      ? Math.round(
          activeEmployees.reduce((sum, e) => sum + (e?.avgCompletionTime || 0), 0) / activeEmployees.length
        )
      : 0,
    avgEfficiency: activeEmployees.length > 0
      ? Math.round(
          activeEmployees.reduce((sum, e) => sum + (e?.efficiency || 0), 0) / activeEmployees.length
        )
      : 0,
    avgCompletionRate: activeEmployees.length > 0
      ? Math.round(
          activeEmployees.reduce((sum, e) => sum + (e?.completionRate || 0), 0) / activeEmployees.length
        )
      : 0,
    totalAbsent: activeEmployees.filter(e => e?.isAbsent).length
  };

  const handlePrevEmployee = () => {
    setAutoSwitch(false);
    if (selectedEmployeeIndex === null) {
      setSelectedEmployeeIndex(activeEmployees.length - 1);
    } else {
      setSelectedEmployeeIndex((selectedEmployeeIndex - 1 + activeEmployees.length) % activeEmployees.length);
    }
  };

  const handleNextEmployee = () => {
    setAutoSwitch(false);
    if (selectedEmployeeIndex === null) {
      setSelectedEmployeeIndex(0);
    } else {
      setSelectedEmployeeIndex((selectedEmployeeIndex + 1) % activeEmployees.length);
    }
  };

  const handleShowAll = () => {
    setSelectedEmployeeIndex(null);
    setAutoSwitch(false);
  };

  return (
    <div className="grid grid-cols-3 gap-3 h-full">
      {/* Левая колонка - Рейтинг сотрудников с переключателем */}
      <div className="col-span-1 bg-gray-800 rounded-xl p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-white">Рейтинг сотрудников</h2>
            {autoSwitch && (
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Clock className="h-4 w-4" />
                <span>{secondsUntilSwitch}с</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevEmployee}
              className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Предыдущий сотрудник"
            >
              <ChevronLeft className="h-6 w-6 text-white" />
            </button>
            <button
              onClick={handleShowAll}
              className={`px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                selectedEmployeeIndex === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              Все
            </button>
            <button
              onClick={handleNextEmployee}
              className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Следующий сотрудник"
            >
              <ChevronRight className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>
        <div className="space-y-3 flex-1 overflow-y-auto">
          {activeEmployees.map((employee, index) => (
            employee && (
              <EmployeeCard 
                key={employee.id} 
                employee={employee} 
                position={index + 1}
                isSelected={selectedEmployeeIndex === index}
                onClick={() => {
                  setSelectedEmployeeIndex(index);
                  setAutoSwitch(false);
                }}
              />
            )
          ))}
        </div>
        {/* Общие метрики отдела */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h3 className="text-xl font-semibold text-white mb-3">Итого по отделу</h3>
          <div className="space-y-3 text-base">
            <div className="flex justify-between text-gray-300">
              <span>Активных задач:</span>
              <span className="font-semibold text-white text-lg">{departmentStats.totalActiveTasks}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>В работе:</span>
              <span className="font-semibold text-blue-400 text-lg">{departmentStats.totalInProgressTasks}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Выполнено за 30 дней:</span>
              <span className="font-semibold text-white text-lg">{departmentStats.totalCompletedTasks}</span>
            </div>
            {departmentStats.totalAbsent > 0 && (
              <div className="flex justify-between text-gray-300">
                <span>Отсутствует сотрудников:</span>
                <span className="font-semibold text-orange-400 text-lg">{departmentStats.totalAbsent}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-300">
              <span>Ср. время выполнения:</span>
              <span className="font-semibold text-white text-lg">{departmentStats.avgCompletionTime} дн.</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Ср. эффективность:</span>
              <span className="font-semibold text-white text-lg">{departmentStats.avgEfficiency}%</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Ср. % выполнения:</span>
              <span className="font-semibold text-white text-lg">{departmentStats.avgCompletionRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Правая часть - Метрики и задачи */}
      <div className="col-span-2 flex flex-col gap-3">
        {/* Метрики текущего сотрудника или общие */}
        {selectedEmployeeIndex !== null && activeEmployees[selectedEmployeeIndex] ? (
          <>
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-3xl font-bold text-white mb-4">
                {activeEmployees[selectedEmployeeIndex]!.name}
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard
                  title="Активных задач"
                  value={activeEmployees[selectedEmployeeIndex]!.activeTasks}
                  icon={Clock}
                  color="blue"
                />
                <MetricCard
                  title="Выполнено за 30 дней"
                  value={activeEmployees[selectedEmployeeIndex]!.completedTasks}
                  icon={CheckCircle}
                  color="green"
                  trend={activeEmployees[selectedEmployeeIndex]!.completionRateTrend}
                  trendLabel="% выполнения"
                />
                <MetricCard
                  title="Ср. время выполнения"
                  value={`${activeEmployees[selectedEmployeeIndex]!.avgCompletionTime} дн.`}
                  icon={Timer}
                  color="purple"
                  trend={activeEmployees[selectedEmployeeIndex]!.completionTimeTrend}
                  trendLabel="скорость"
                />
                <MetricCard
                  title="Эффективность"
                  value={`${activeEmployees[selectedEmployeeIndex]!.efficiency}%`}
                  icon={Gauge}
                  color="cyan"
                  trend={activeEmployees[selectedEmployeeIndex]!.efficiencyTrend}
                  trendLabel="динамика"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              title="Активных задач"
              value={departmentStats.totalActiveTasks}
              icon={Clock}
              color="blue"
            />
            <MetricCard
              title="В работе"
              value={departmentStats.totalInProgressTasks}
              icon={PlayCircle}
              color="cyan"
            />
            <MetricCard
              title="Выполнено за 30 дней"
              value={departmentStats.totalCompletedTasks}
              icon={CheckCircle}
              color="green"
            />
            <MetricCard
              title="Средний % выполнения"
              value={`${departmentStats.avgCompletionRate}%`}
              icon={TrendingUp}
              color="purple"
            />
          </div>
        )}

        {/* Карточки задач */}
        <div className="bg-gray-800 rounded-xl p-5 flex-1 flex flex-col overflow-hidden">
          <h2 className="text-3xl font-bold text-white mb-4">
            {selectedEmployeeIndex !== null 
              ? `Задачи ${activeEmployees[selectedEmployeeIndex]!.name}`
              : 'Задачи отдела'}
            <span className="text-lg font-normal text-gray-400 ml-3">
              (в работе показаны первыми)
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-4 overflow-y-auto flex-1">
            {displayTasks.map(task => {
              const employee = activeEmployees.find(e => e?.id === task.RESPONSIBLE_ID);
              return employee && <TaskCard key={task.ID} task={task} employee={employee} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeCard({ employee, position, isSelected, onClick }: { 
  employee: EmployeeMetrics; 
  position: number; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const getPositionColor = (pos: number) => {
    if (pos === 1) return 'bg-yellow-600 text-white';
    if (pos === 2) return 'bg-gray-400 text-white';
    if (pos === 3) return 'bg-orange-700 text-white';
    return 'bg-gray-600 text-gray-300';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 100) return 'text-green-400';
    if (rating >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div 
      className={`p-4 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${
        isSelected 
          ? 'bg-blue-700 ring-2 ring-blue-500' 
          : employee.isAbsent 
            ? 'bg-gray-700 border-2 border-red-500 hover:bg-gray-600'
            : 'bg-gray-700 hover:bg-gray-600'
      }`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${getPositionColor(position)}`}>
        {position}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold text-lg truncate ${employee.isAbsent ? 'text-red-400' : 'text-white'}`}>
            {employee.name}
          </h3>
          {employee.isAbsent && (
            <span title="Отсутствует">
              <CalendarOff className="h-5 w-5 text-red-400" />
            </span>
          )}
          {!employee.isAbsent && employee.futureAbsence && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              (отс. через {employee.futureAbsence.daysUntil} дн.)
            </span>
          )}
        </div>
        <div className="flex gap-4 text-sm text-gray-400">
          <span>А: {employee.activeTasks}</span>
          {employee.inProgressTasks > 0 && (
            <span className="text-blue-400">Р: {employee.inProgressTasks}</span>
          )}
          <span>В: {employee.completedTasks}</span>
          {employee.overdueTasks > 0 && (
            <span className="text-red-400">П: {employee.overdueTasks}</span>
          )}
        </div>
      </div>
      <div className={`text-3xl font-bold ${getRatingColor(employee.rating)}`}>
        {employee.rating}
      </div>
    </div>
  );
}

function TaskCard({ task, employee }: { task: any; employee: EmployeeMetrics }) {
  const getDaysColor = (days: number) => {
    if (task.isInProgress) return 'bg-blue-900 border-blue-600';
    if (days >= 7) return 'bg-red-900 border-red-600';
    if (days >= 3) return 'bg-yellow-900 border-yellow-600';
    return 'bg-gray-700 border-gray-600';
  };

  const inactiveDays = task.inactiveDays || 0;

  return (
    <div className={`p-4 rounded-xl border-2 ${getDaysColor(inactiveDays)} relative`}>
      {task.isInProgress && (
        <div className="absolute top-2 right-2">
          <PlayCircle className="h-5 w-5 text-blue-400" />
        </div>
      )}
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-white text-base line-clamp-2 flex-1">{task.TITLE}</h4>
        <span className={`text-2xl font-bold ml-3 ${
          task.isInProgress ? 'text-blue-400' :
          inactiveDays >= 7 ? 'text-red-400' : 
          inactiveDays >= 3 ? 'text-yellow-400' : 
          'text-gray-400'
        }`}>
          {task.isInProgress && task.executionTime !== undefined 
            ? `${task.executionTime} дн. в работе` 
            : `${inactiveDays} дн.`}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-300">
        <div className="flex items-center gap-2 truncate">
          <User className="h-4 w-4 flex-shrink-0" />
          <span className={`truncate ${employee.isAbsent ? 'text-orange-400' : ''}`}>
            {employee.name}
            {employee.isAbsent && ' (отсутствует)'}
          </span>
        </div>
        {task.DEADLINE && (
          <div className="flex items-center gap-1 ml-2">
            <Calendar className="h-4 w-4" />
            <span>{new Date(task.DEADLINE).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>
          </div>
        )}
      </div>
      {task.isOverdue && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4" />
          <span>Просрочено</span>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color, trend, trendLabel }: any) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-950 text-blue-400 border-blue-600',
    green: 'bg-green-950 text-green-400 border-green-600',
    purple: 'bg-purple-950 text-purple-400 border-purple-600',
    cyan: 'bg-cyan-950 text-cyan-400 border-cyan-600'
  };

  return (
    <div className={`${colors[color]} p-5 rounded-xl border-2 border-opacity-30`}>
      <div className="flex items-center gap-3 mb-2">
        <Icon className="h-8 w-8" />
        <span className="text-base">{title}</span>
      </div>
      <div className="text-4xl font-bold text-white">{value}</div>
      {trend !== undefined && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          {trend > 0 ? (
            <>
              <TrendingUp className="h-5 w-5 text-green-400" />
              <span className="text-green-400">+{Math.abs(trend).toFixed(1)}%</span>
            </>
          ) : trend < 0 ? (
            <>
              <TrendingDown className="h-5 w-5 text-red-400" />
              <span className="text-red-400">{Math.abs(trend).toFixed(1)}%</span>
            </>
          ) : (
            <span className="text-gray-400">Без изменений</span>
          )}
        </div>
      )}
    </div>
  );
}

function calculateAvgCompletionTime(tasks: any[]): number {
  if (tasks.length === 0) return 0;
  
  const completionTimes = tasks
    .filter(task => {
      const createdDate = task.CREATED_DATE;
      const closedDate = task.CLOSED_DATE;
      return createdDate && closedDate;
    })
    .map(task => {
      const createdDate = task.CREATED_DATE;
      const closedDate = task.CLOSED_DATE;
      const created = new Date(createdDate).getTime();
      const closed = new Date(closedDate).getTime();
      return (closed - created) / (1000 * 60 * 60 * 24); // дни
    });
  
  if (completionTimes.length === 0) return 0;
  
  return Math.round(
    completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
  );
}

function calculateEfficiency(tasks: any[]): number {
  if (tasks.length === 0) return 100;
  
  const tasksCompletedOnTime = tasks.filter(task => {
    const deadline = task.DEADLINE;
    const closedDate = task.CLOSED_DATE;
    if (!deadline || !closedDate) return true;
    return new Date(closedDate) <= new Date(deadline);
  }).length;
  
  return Math.round((tasksCompletedOnTime / tasks.length) * 100);
}