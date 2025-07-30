'use client';

import { DashboardData } from '@/lib/bitrix/types';
import { AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

interface StatsCardsTvProps {
  data: DashboardData;
}

export function StatsCardsTv({ data }: StatsCardsTvProps) {
  const { stats } = data;

  const cards = [
    {
      title: 'Активные задачи',
      value: stats.totalActive,
      icon: Clock,
      color: 'bg-blue-600',
      bgColor: 'bg-blue-950',
      textColor: 'text-blue-400'
    },
    {
      title: 'Требуют внимания',
      value: stats.warningTasks,
      icon: AlertCircle,
      color: 'bg-yellow-600',
      bgColor: 'bg-yellow-950',
      textColor: 'text-yellow-400'
    },
    {
      title: 'Критические',
      value: stats.criticalTasks,
      icon: XCircle,
      color: 'bg-red-600',
      bgColor: 'bg-red-950',
      textColor: 'text-red-400'
    },
    {
      title: 'Завершено за 30 дней',
      value: stats.totalCompleted,
      icon: CheckCircle,
      color: 'bg-green-600',
      bgColor: 'bg-green-950',
      textColor: 'text-green-400'
    }
  ];

  return (
    <div className="grid grid-cols-4 gap-6 mb-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className={`${card.bgColor} p-8 rounded-xl border ${card.color} border-opacity-20`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className={`inline-flex p-3 rounded-lg ${card.color} bg-opacity-20 mb-4`}>
                  <Icon className={`h-10 w-10 ${card.textColor}`} />
                </div>
                <p className={`text-xl font-medium ${card.textColor}`}>
                  {card.title}
                </p>
                <p className="text-5xl font-bold text-white mt-2">
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