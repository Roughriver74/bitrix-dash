'use client';

import { DashboardData } from '@/lib/bitrix/types';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';

interface ActivityHeatmapTvProps {
  data: DashboardData;
}

export function ActivityHeatmapTv({ data }: ActivityHeatmapTvProps) {
  const { stats } = data;

  const pieData = Object.entries(stats.inactivityDistribution).map(([label, value]) => ({
    name: label,
    value
  }));

  const COLORS = {
    '0-1 день': '#10B981',
    '2-3 дня': '#F59E0B',
    '4-7 дней': '#F97316',
    'Более недели': '#EF4444'
  };

  const statusData = Object.entries(stats.byStatus).map(([status, count]) => ({
    name: status,
    value: count
  }));

  const STATUS_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280'];

  const renderCustomLabel = (data: any) => {
    return `${data.name}: ${data.value}`;
  };

  return (
    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
      <h3 className="text-2xl font-semibold text-white mb-6">
        Анализ активности
      </h3>
      
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="text-lg font-medium text-gray-300 mb-4 text-center">
            Распределение по времени неактивности
          </h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                ))}
              </Pie>
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
                verticalAlign="bottom" 
                height={36}
                wrapperStyle={{ fontSize: '16px', color: '#9CA3AF' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-lg font-medium text-gray-300 mb-4 text-center">
            Распределение по статусам
          </h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                ))}
              </Pie>
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
                verticalAlign="bottom" 
                height={36}
                wrapperStyle={{ fontSize: '16px', color: '#9CA3AF' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}