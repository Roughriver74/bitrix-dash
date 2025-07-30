import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '@/lib/bitrix/types';

interface StreamProgress {
  message: string;
  progress: number;
}

interface StreamResponse {
  type: 'progress' | 'complete' | 'error' | 'chunked_start' | 'chunk';
  message?: string;
  progress?: number;
  data?: DashboardData | string; // Can be DashboardData for complete or string for chunks
  error?: string;
  loadTime?: number;
  // Chunked transmission fields
  totalChunks?: number;
  totalSize?: number;
  index?: number;
  isLast?: boolean;
}

export function useDashboardStream() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamProgress>({ message: '', progress: 0 });
  
  // Chunked data reconstruction state
  const [chunkedData, setChunkedData] = useState<{
    chunks: string[];
    totalChunks: number;
    receivedChunks: number;
  } | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    setProgress({ message: 'Подключение...', progress: 0 });
    setChunkedData(null); // Reset chunked data state

    // Local variable to track chunked data during this fetch session
    let currentChunkedData: {
      chunks: string[];
      totalChunks: number;
      receivedChunks: number;
    } | null = null;

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

      let buffer = ''; // Буфер для накопления неполных SSE сообщений
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        
        // Добавляем к буферу
        buffer += chunk;
        
        // Ищем полные SSE сообщения (заканчиваются на \n\n)
        let messageEndIndex;
        while ((messageEndIndex = buffer.indexOf('\n\n')) !== -1) {
          const completeMessage = buffer.slice(0, messageEndIndex);
          buffer = buffer.slice(messageEndIndex + 2);
          
          const lines = completeMessage.split('\n');
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6);
                const json: StreamResponse = JSON.parse(jsonData);
              
              switch (json.type) {
                case 'progress':
                  setProgress({
                    message: json.message || '',
                    progress: json.progress || 0
                  });
                  break;
                
                case 'chunked_start':
                  currentChunkedData = {
                    chunks: new Array(json.totalChunks || 0).fill(''),
                    totalChunks: json.totalChunks || 0,
                    receivedChunks: 0
                  };
                  setChunkedData(currentChunkedData);
                  setProgress({
                    message: 'Получение данных по частям...',
                    progress: 95
                  });
                  break;
                
                case 'chunk':
                  if (currentChunkedData && typeof json.index === 'number' && json.data && typeof json.data === 'string') {
                    const newChunks: string[] = [...currentChunkedData.chunks];
                    newChunks[json.index] = json.data;
                    const newReceivedChunks: number = currentChunkedData.receivedChunks + 1;
                    
                    currentChunkedData = {
                      chunks: newChunks,
                      totalChunks: currentChunkedData.totalChunks,
                      receivedChunks: newReceivedChunks
                    };
                    setChunkedData(currentChunkedData);
                    
                    // Update progress for chunked reception
                    const chunkProgress = 95 + (newReceivedChunks / currentChunkedData.totalChunks) * 5;
                    setProgress({
                      message: `Получено ${newReceivedChunks}/${currentChunkedData.totalChunks} частей...`,
                      progress: Math.round(chunkProgress)
                    });
                    
                    // Check if all chunks received
                    if (newReceivedChunks === currentChunkedData.totalChunks) {
                      try {
                        const fullJsonString = newChunks.join('');
                        const reconstructedData = JSON.parse(fullJsonString);
                        setData(reconstructedData);
                        setLoading(false);
                      } catch (parseError) {
                        console.error('❌ Ошибка сборки данных из частей:', parseError);
                        setError('Ошибка сборки данных');
                        setLoading(false);
                      }
                    }
                  } else {
                    console.error('❌ Неверный формат chunk сообщения:', json);
                  }
                  break;
                
                case 'complete':
                  if (json.data && typeof json.data === 'object') {
                    // Direct data (non-chunked)
                    setData(json.data as DashboardData);
                    setLoading(false);
                  } else if (currentChunkedData) {
                    // Chunked data completion
                    if (currentChunkedData.receivedChunks === currentChunkedData.totalChunks) {
                      setLoading(false);
                    } else {
                      setError(`Получено только ${currentChunkedData.receivedChunks} из ${currentChunkedData.totalChunks} частей данных`);
                      setLoading(false);
                    }
                  } else {
                    setError('Данные не получены');
                    setLoading(false);
                  }
                  break;
                
                case 'error':
                  setError(json.error || 'Неизвестная ошибка');
                  setLoading(false);
                  break;
              }
            } catch (e) {
              console.error('❌ Ошибка парсинга SSE:', e);
            }
          }
        }
      }
      }
    } catch (err) {
      console.error('❌ Ошибка в fetchData:', err);
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