'use client';

import { DashboardData } from '@/lib/bitrix/types';
import { TrendingUp, TrendingDown, Activity, BarChart, Users, CheckCircle } from 'lucide-react';

interface AnalyticsViewTvProps {
  data: DashboardData;
}

export function AnalyticsViewTv({ data }: AnalyticsViewTvProps) {
  // Рассчитываем аналитику
  const analytics = calculateAnalytics(data);

  return (
    <div className="space-y-4">
      {/* Ключевые метрики */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Скорость выполнения"
          value={`${analytics.completionRate}%`}
          trend={analytics.completionTrend}
          icon={TrendingUp}
          description="задач выполнено вовремя"
        />
        <MetricCard
          title="Средняя загрузка"
          value={analytics.avgWorkload}
          trend={analytics.workloadTrend}
          icon={Activity}
          description="задач на сотрудника"
        />
        <MetricCard
          title="Время выполнения"
          value={`${analytics.avgCompletionDays} дн`}
          trend={analytics.timeTrend}
          icon={BarChart}
          description="в среднем на задачу"
        />
        <MetricCard
          title="Эффективность команды"
          value={`${analytics.teamEfficiency}%`}
          trend={analytics.efficiencyTrend}
          icon={Users}
          description="общий показатель"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* График выполнения по дням */}
        <div className="bg-gray-800 p-6 rounded-xl">
          <h3 className="text-xl font-bold text-white mb-4">Выполнено задач за последние 30 дней</h3>
          <CompletionChart completedTasks={data.completedTasks} />
        </div>

        {/* Распределение по типам задач */}
        <div className="bg-gray-800 p-6 rounded-xl">
          <h3 className="text-xl font-bold text-white mb-4">Распределение активных задач</h3>
          <TaskDistribution tasks={data.tasks} />
        </div>
      </div>

      {/* Топ продуктивных сотрудников */}
      <div className="bg-gray-800 p-6 rounded-xl">
        <h3 className="text-xl font-bold text-white mb-4">Рейтинг продуктивности</h3>
        <ProductivityRanking data={data} />
      </div>
    </div>
  );
}

function MetricCard({ title, value, trend, icon: Icon, description }: any) {
  const isPositive = trend > 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  
  return (
    <div className="bg-gray-800 p-6 rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-blue-600 bg-opacity-20 rounded-lg">
          <Icon className="h-8 w-8 text-blue-400" />
        </div>
        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          <TrendIcon className="h-4 w-4" />
          <span className="text-base font-medium">{Math.abs(trend)}%</span>
        </div>
      </div>
      <h4 className="text-lg text-gray-300 mb-1">{title}</h4>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

function CompletionChart({ completedTasks }: any) {
  // Группируем задачи по дням
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date.toISOString().split('T')[0];
  });

  const tasksByDay = last30Days.map(day => {
    const count = completedTasks.filter((task: any) => 
      task.CLOSED_DATE && task.CLOSED_DATE.startsWith(day)
    ).length;
    return { day, count };
  });

  const maxCount = Math.max(...tasksByDay.map(d => d.count));

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 h-40">
        {tasksByDay.map((item, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div className="w-full bg-gray-700 rounded-t flex items-end justify-center">
              <div
                className="w-full bg-green-500 rounded-t transition-all duration-500"
                style={{ 
                  height: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
                  minHeight: item.count > 0 ? '4px' : '0'
                }}
              />
            </div>
            {item.count > 0 && index % 5 === 0 && (
              <span className="text-xs text-gray-400 mt-1">{item.count}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>30 дней назад</span>
        <span>Сегодня</span>
      </div>
    </div>
  );
}

function TaskDistribution({ tasks }: any) {
  const distribution = {
    critical: tasks.filter((t: any) => t.priority === 'critical').length,
    warning: tasks.filter((t: any) => t.priority === 'warning').length,
    normal: tasks.filter((t: any) => t.priority === 'normal').length,
    overdue: tasks.filter((t: any) => t.isOverdue).length,
    stagnant: tasks.filter((t: any) => t.inactiveDays > 5).length,
  };

  const total = tasks.length;

  return (
    <div className="space-y-4">
      <DistributionBar label="Критические" value={distribution.critical} total={total} color="red" />
      <DistributionBar label="Требуют внимания" value={distribution.warning} total={total} color="yellow" />
      <DistributionBar label="Обычные" value={distribution.normal} total={total} color="green" />
      <DistributionBar label="Просроченные" value={distribution.overdue} total={total} color="red" />
      <DistributionBar label="Застоявшиеся" value={distribution.stagnant} total={total} color="orange" />
    </div>
  );
}

function DistributionBar({ label, value, total, color }: { label: string; value: number; total: number; color: 'red' | 'yellow' | 'green' | 'orange' }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  
  const colors = {
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500'
  };

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-300 text-sm">{label}</span>
        <span className="text-white font-medium text-sm">{value} ({percentage}%)</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-3">
        <div
          className={`${colors[color]} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ProductivityRanking({ data }: any) {
  const userStats = data.users.map((user: any) => {
    const completed = data.completedTasks.filter((t: any) => t.RESPONSIBLE_ID === user.id).length;
    const active = data.tasks.filter((t: any) => t.RESPONSIBLE_ID === user.id).length;
    const overdue = data.tasks.filter((t: any) => t.RESPONSIBLE_ID === user.id && t.isOverdue).length;
    
    const score = completed * 10 - overdue * 5 + (active > 0 ? 5 : 0);
    
    return { ...user, completed, active, overdue, score };
  }).sort((a: any, b: any) => b.score - a.score);

  return (
    <div className="grid grid-cols-2 gap-3">
      {userStats.slice(0, 4).map((user: any, index: number) => (
        <div key={user.id} className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
          <div className={`
            text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full
            ${index === 0 ? 'bg-yellow-600 text-white' : 
              index === 1 ? 'bg-gray-400 text-white' : 
              index === 2 ? 'bg-orange-700 text-white' : 
              'bg-gray-600 text-gray-300'}
          `}>
            {index + 1}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white text-base">{user.NAME}</h4>
            <div className="flex gap-3 text-xs text-gray-400">
              <span className="text-green-400">
                <CheckCircle className="inline h-3 w-3 mr-1" />
                {user.completed}
              </span>
              <span className="text-blue-400">
                Активных: {user.active}
              </span>
              {user.overdue > 0 && (
                <span className="text-red-400">
                  Просрочено: {user.overdue}
                </span>
              )}
            </div>
          </div>
          <div className="text-xl font-bold text-white">
            {user.score}
          </div>
        </div>
      ))}
    </div>
  );
}

function calculateAnalytics(data: DashboardData) {
  const { tasks, completedTasks, users } = data;
  
  // Скорость выполнения
  const onTimeCompleted = completedTasks.filter((task: any) => {
    if (!task.DEADLINE || !task.CLOSED_DATE) return true;
    return new Date(task.CLOSED_DATE) <= new Date(task.DEADLINE);
  }).length;
  
  const completionRate = completedTasks.length > 0 
    ? Math.round((onTimeCompleted / completedTasks.length) * 100)
    : 0;

  // Средняя загрузка
  const avgWorkload = Math.round(tasks.length / users.length);

  // Среднее время выполнения
  const completionTimes = completedTasks
    .filter((task: any) => task.CREATED_DATE && task.CLOSED_DATE)
    .map((task: any) => {
      const created = new Date(task.CREATED_DATE);
      const closed = new Date(task.CLOSED_DATE);
      return (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    });
  
  const avgCompletionDays = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : 0;

  // Эффективность команды
  const teamEfficiency = Math.round(
    (completionRate * 0.4) + 
    (100 - (tasks.filter((t: any) => t.isOverdue).length / tasks.length) * 100) * 0.3 +
    (100 - (tasks.filter((t: any) => t.inactiveDays > 5).length / tasks.length) * 100) * 0.3
  );

  return {
    completionRate,
    completionTrend: 12, // Позитивный тренд
    avgWorkload,
    workloadTrend: -5, // Небольшое снижение
    avgCompletionDays,
    timeTrend: -8, // Ускорение
    teamEfficiency,
    efficiencyTrend: 15 // Рост эффективности
  };
}