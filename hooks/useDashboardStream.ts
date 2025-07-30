import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '@/lib/bitrix/types';

interface StreamProgress {
  message: string;
  progress: number;
}

interface StreamResponse {
  type: 'progress' | 'complete' | 'error';
  message?: string;
  progress?: number;
  data?: DashboardData;
  error?: string;
  loadTime?: number;
}

export function useDashboardStream() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamProgress>({ message: '', progress: 0 });

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    setProgress({ message: 'Подключение...', progress: 0 });

    try {
      const response = await fetch(`/api/bitrix/tasks-stream${refresh ? '?refresh=true' : ''}`);
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки данных');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Не удалось получить поток данных');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const jsonData = line.slice(6);
              console.log('📨 Получено SSE сообщение:', jsonData.substring(0, 200) + '...');
              
              const json: StreamResponse = JSON.parse(jsonData);
              console.log('📋 Тип сообщения:', json.type);
              
              switch (json.type) {
                case 'progress':
                  setProgress({
                    message: json.message || '',
                    progress: json.progress || 0
                  });
                  console.log(`📊 Прогресс: ${json.progress}% - ${json.message}`);
                  break;
                
                case 'complete':
                  console.log('🎉 Получено сообщение complete!');
                  console.log('📦 Данные доступны:', !!json.data);
                  console.log('⏱️ Время загрузки:', json.loadTime, 'мс');
                  
                  if (json.data) {
                    setData(json.data);
                    setLoading(false);
                    console.log(`✅ Данные успешно установлены`);
                  } else {
                    console.error('❌ Данные не получены в complete сообщении');
                    setError('Данные не получены');
                    setLoading(false);
                  }
                  break;
                
                case 'error':
                  console.error('❌ Получена ошибка:', json.error);
                  setError(json.error || 'Неизвестная ошибка');
                  setLoading(false);
                  break;
              }
            } catch (e) {
              console.error('❌ Ошибка парсинга SSE:', e);
              console.error('📋 Проблемная строка:', line);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    progress,
    refresh: () => fetchData(true)
  };
}