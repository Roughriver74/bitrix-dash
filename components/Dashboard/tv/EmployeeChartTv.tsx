'use client';

import { DashboardData } from '@/lib/bitrix/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface EmployeeChartTvProps {
  data: DashboardData;
}

export function EmployeeChartTv({ data }: EmployeeChartTvProps) {
  const { stats } = data;

  const chartData = Object.entries(stats.byEmployee)
    .map(([userId, employeeStats]) => ({
      name: employeeStats.name || 'Неизвестный',
      active: employeeStats.active,
      completed: employeeStats.completed,
      critical: employeeStats.critical,
      warning: employeeStats.warning
    }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 10);

  return (
    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
      <h3 className="text-2xl font-semibold text-white mb-6">
        Распределение задач по сотрудникам
      </h3>
      
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={100}
            tick={{ fill: '#9CA3AF', fontSize: 14 }}
          />
          <YAxis tick={{ fill: '#9CA3AF', fontSize: 14 }} />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              border: '1px solid #4B5563',
              borderRadius: '8px',
              fontSize: '16px'
            }}
            labelStyle={{ color: '#F3F4F6' }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '16px' }}
            iconSize={20}
          />
          <Bar dataKey="active" fill="#3B82F6" name="Активные" />
          <Bar dataKey="completed" fill="#10B981" name="Завершено" />
          <Bar dataKey="critical" fill="#EF4444" name="Критические" />
          <Bar dataKey="warning" fill="#F59E0B" name="Внимание" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}