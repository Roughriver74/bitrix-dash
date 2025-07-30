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
import { Calendar, CalendarDays } from 'lucide-react';

interface EmployeeChartProps {
  data: DashboardData;
}

export function EmployeeChart({ data }: EmployeeChartProps) {
  const { stats, absences = {} } = data;

  const chartData = Object.entries(stats.byEmployee)
    .map(([userId, employeeStats]) => ({
      userId,
      name: employeeStats.name || 'Неизвестный',
      active: employeeStats.active,
      completed: employeeStats.completed,
      critical: employeeStats.critical,
      warning: employeeStats.warning,
      isAbsent: employeeStats.isAbsent,
      absenceInfo: absences[userId]
    }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 10); // Top 10 employees

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h3 className="text-xl font-semibold text-gray-900 mb-6">
        Распределение задач по сотрудникам
      </h3>
      
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={100}
            tick={({ x, y, payload, index }) => {
              const employee = chartData[index];
              const isAbsent = employee?.isAbsent;
              const absenceInfo = employee?.absenceInfo;
              
              return (
                <g transform={`translate(${x},${y})`}>
                  <text 
                    x={0} 
                    y={0} 
                    dy={16} 
                    textAnchor="end" 
                    fill={isAbsent ? "#F97316" : "#666"}
                    className="text-xs"
                  >
                    {payload.value}
                  </text>
                  {isAbsent && (
                    <text 
                      x={0} 
                      y={0} 
                      dy={30} 
                      textAnchor="end" 
                      fill="#F97316"
                      className="text-xs"
                    >
                      (Отсутствует)
                    </text>
                  )}
                  {!isAbsent && absenceInfo?.futureAbsence && (
                    <text 
                      x={0} 
                      y={0} 
                      dy={30} 
                      textAnchor="end" 
                      fill="#6B7280"
                      className="text-xs"
                    >
                      (через {absenceInfo.futureAbsence.daysUntil} дн.)
                    </text>
                  )}
                </g>
              );
            }}
          />
          <YAxis />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
          />
          <Legend />
          <Bar dataKey="active" fill="#3B82F6" name="Активные" />
          <Bar dataKey="completed" fill="#10B981" name="Завершено" />
          <Bar dataKey="critical" fill="#EF4444" name="Критические" />
          <Bar dataKey="warning" fill="#F59E0B" name="Внимание" />
        </BarChart>
      </ResponsiveContainer>

      {/* Легенда отсутствий */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-orange-500" />
            <span className="text-gray-600">Сотрудник отсутствует</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-500" />
            <span className="text-gray-600">Запланированное отсутствие</span>
          </div>
        </div>
      </div>
    </div>
  );
}