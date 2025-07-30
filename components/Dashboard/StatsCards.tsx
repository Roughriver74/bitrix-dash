'use client';

import { DashboardData } from '@/lib/bitrix/types';
import { AlertCircle, CheckCircle, Clock, XCircle, PlayCircle } from 'lucide-react';

interface StatsCardsProps {
  data: DashboardData;
}

export function StatsCards({ data }: StatsCardsProps) {
  const { stats } = data;

  const cards = [
    {
      title: 'Активные задачи',
      value: stats.totalActive,
      icon: Clock,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700'
    },
    {
      title: 'В работе',
      value: stats.inProgressTasks,
      icon: PlayCircle,
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-700'
    },
    {
      title: 'Требуют внимания',
      value: stats.warningTasks,
      icon: AlertCircle,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700'
    },
    {
      title: 'Критические',
      value: stats.criticalTasks,
      icon: XCircle,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700'
    },
    {
      title: 'Завершено за 30 дней',
      value: stats.totalCompleted,
      icon: CheckCircle,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className={`inline-flex p-2 rounded-lg ${card.bgColor} mb-4`}>
                  <Icon className={`h-6 w-6 ${card.textColor}`} />
                </div>
                <p className="text-sm font-medium text-gray-600">
                  {card.title}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {card.value.toLocaleString('ru-RU')}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}