'use client';

import { useEffect, useState } from 'react';
import { StatsCards } from '@/components/Dashboard/StatsCards';
import { TasksTable } from '@/components/Dashboard/TasksTable';
import { EmployeeChart } from '@/components/Dashboard/EmployeeChart';
import { ActivityHeatmap } from '@/components/Dashboard/ActivityHeatmap';
import { DashboardData } from '@/lib/bitrix/types';
import { RefreshCw, Tv } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      
      const response = await fetch(`/api/bitrix/tasks${refresh ? '?refresh=true' : ''}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-lg mt-4">Загрузка данных из Битрикс24...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Ошибка загрузки данных</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Повторить попытку
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              Дашборд IT отдела
            </h1>
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <span className="font-medium">{data.department.NAME}</span>
              <span className="text-gray-400">•</span>
              <span>Обновлено: {new Date(data.timestamp).toLocaleString('ru-RU')}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm
                bg-gray-600 hover:bg-gray-700 text-white hover:shadow-md"
            >
              <Tv className="h-4 w-4" />
              ТВ режим
            </Link>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm
                ${refreshing 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white hover:shadow-md'
                }
              `}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Обновление...' : 'Обновить'}
            </button>
          </div>
        </div>

        <StatsCards data={data} />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <EmployeeChart data={data} />
          <ActivityHeatmap data={data} />
        </div>

        <TasksTable tasks={data.tasks} users={data.users} absences={data.absences} />
      </div>
    </div>
  );
}