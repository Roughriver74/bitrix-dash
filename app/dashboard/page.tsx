'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { UnifiedDashboardTv } from '@/components/Dashboard/tv/UnifiedDashboardTv';
import { DashboardData } from '@/lib/bitrix/types';
import { RefreshCw, Maximize2, Monitor } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const VIEWS = [
  { id: 'dashboard', name: 'Рейтинг IT отдела', component: 'dashboard' }
];

const DEFAULT_ROTATION_INTERVAL = 60000; // 60 секунд - только одна страница

export default function TvDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);

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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    // Check configuration first
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (!config.isConfigured) {
            router.push('/setup');
            return;
          }
        }
      } catch (error) {
        console.error('Config check error:', error);
      } finally {
        setCheckingConfig(false);
      }
    };

    checkConfig().then(() => {
      fetchData();
      
      // Add tv-mode class to body
      document.body.classList.add('tv-mode');
      
      // Auto-refresh every 2 minutes for TV display
      const interval = setInterval(() => fetchData(), 2 * 60 * 1000);
      
      return () => {
        clearInterval(interval);
        document.body.classList.remove('tv-mode');
      };
    });
  }, [router]);

  if (checkingConfig || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto"></div>
          <p className="text-2xl mt-4 text-white">
            {checkingConfig ? 'Проверка конфигурации...' : 'Загрузка данных из Битрикс24...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-500 text-3xl mb-4">Ошибка загрузки данных</div>
          <p className="text-gray-300 mb-4 text-xl">{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded text-xl"
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

  // Функция рендеринга текущего представления
  const renderCurrentView = () => {
    return <UnifiedDashboardTv data={data} />;
  };

  return (
    <div className="h-screen bg-gray-900 overflow-hidden">
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center p-4 pb-2 flex-shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Дашборд IT отдела
            </h1>
            <p className="text-gray-300 text-base">
              {data.department.NAME} • Обновлено: {new Date(data.timestamp).toLocaleString('ru-RU')}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard-compact"
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                bg-gray-700 hover:bg-gray-600 text-white text-base"
            >
              <Monitor className="h-5 w-5" />
              Компактный вид
            </Link>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                bg-gray-700 hover:bg-gray-600 text-white text-base"
            >
              <Maximize2 className="h-5 w-5" />
              {isFullscreen ? 'Выйти' : 'На весь экран'}
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-base
                ${refreshing 
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
              `}
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Обновление...' : 'Обновить'}
            </button>
          </div>
        </div>

        {/* Рендер текущего представления */}
        <div className="flex-1 overflow-hidden px-4 pb-4">
          {renderCurrentView()}
        </div>
      </div>
    </div>
  );
}