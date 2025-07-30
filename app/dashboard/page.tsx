'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { UnifiedDashboardTv } from '@/components/Dashboard/tv/UnifiedDashboardTv';
import { DashboardData } from '@/lib/bitrix/types';
import { RefreshCw, Maximize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDashboardStream } from '@/hooks/useDashboardStream';

const VIEWS = [
  { id: 'dashboard', name: 'Рейтинг', component: 'dashboard' }
];

const DEFAULT_ROTATION_INTERVAL = 60000; // 60 секунд - только одна страница

export default function TvDashboardPage() {
  const router = useRouter();
  const { data, loading, error, progress, refresh } = useDashboardStream();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);
  
  // Debug logging
  console.log('🎯 Dashboard state:', { 
    hasData: !!data, 
    loading, 
    error, 
    progress: progress.progress,
    message: progress.message,
    checkingConfig 
  });


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
      // Add tv-mode class to body
      document.body.classList.add('tv-mode');
      
      // Auto-refresh every 15 minutes for TV display
      const interval = setInterval(() => refresh(), 15 * 60 * 1000);
      
      return () => {
        clearInterval(interval);
        document.body.classList.remove('tv-mode');
      };
    });
  }, [router]);

  if (checkingConfig || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto"></div>
          
          {checkingConfig ? (
            <p className="text-2xl mt-4 text-white">Проверка конфигурации...</p>
          ) : (
            <>
              <p className="text-2xl mt-4 text-white">{progress.message || 'Загрузка данных...'}</p>
              {progress.progress > 0 && (
                <div className="w-full bg-gray-700 rounded-full h-2 mt-4">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
              )}
              <p className="text-sm text-gray-400 mt-2">{progress.progress}%</p>
            </>
          )}
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
            onClick={() => refresh()}
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
              Дашборд 
            </h1>
            <p className="text-gray-300 text-base">
              {data.department.NAME} • Обновлено: {new Date(data.timestamp).toLocaleString('ru-RU')}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                bg-gray-700 hover:bg-gray-600 text-white text-base"
            >
              <Maximize2 className="h-5 w-5" />
              {isFullscreen ? 'Выйти' : 'На весь экран'}
            </button>
            <button
              onClick={() => refresh()}
              disabled={loading}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-base
                ${loading 
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
              `}
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Обновление...' : 'Обновить'}
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