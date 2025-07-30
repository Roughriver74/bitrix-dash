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
      console.log('🔌 Начинаем SSE подключение...');
      const response = await fetch(`/api/bitrix/tasks-stream${refresh ? '?refresh=true' : ''}`);
      console.log('📡 Ответ получен, статус:', response.status, response.statusText);
      
      if (!response.ok) {
        console.error('❌ HTTP ошибка:', response.status, response.statusText);
        throw new Error('Ошибка загрузки данных');
      }

      console.log('📖 Получаем reader для body...');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        console.error('❌ Reader недоступен');
        throw new Error('Не удалось получить поток данных');
      }
      
      console.log('✅ Reader готов, начинаем чтение...');

      let buffer = ''; // Буфер для накопления неполных SSE сообщений
      
      while (true) {
        console.log('🔄 Читаем chunk...');
        const { done, value } = await reader.read();
        console.log('📦 Chunk получен:', { done, valueLength: value?.length });
        
        if (done) {
          console.log('✅ Чтение завершено');
          break;
        }

        const chunk = decoder.decode(value);
        console.log('📝 Decoded chunk длина:', chunk.length);
        
        // Добавляем к буферу
        buffer += chunk;
        
        // Ищем полные SSE сообщения (заканчиваются на \n\n)
        let messageEndIndex;
        while ((messageEndIndex = buffer.indexOf('\n\n')) !== -1) {
          const completeMessage = buffer.slice(0, messageEndIndex);
          buffer = buffer.slice(messageEndIndex + 2);
          
          console.log('📋 Полное SSE сообщение найдено:', completeMessage.length, 'символов');
          
          const lines = completeMessage.split('\n');
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
                
                case 'chunked_start':
                  console.log(`📦 Начало chunked передачи: ${json.totalChunks} частей, ${json.totalSize} символов`);
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
                    
                    console.log(`📦 Получена часть ${json.index + 1}/${currentChunkedData.totalChunks} (${json.data.length} символов)`);
                    
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
                      console.log('📦 Все части получены, собираем данные...');
                      try {
                        const fullJsonString = newChunks.join('');
                        const reconstructedData = JSON.parse(fullJsonString);
                        console.log('✅ Данные успешно собраны из частей');
                        setData(reconstructedData);
                      } catch (parseError) {
                        console.error('❌ Ошибка сборки данных из частей:', parseError);
                        setError('Ошибка сборки данных');
                      }
                    }
                  }
                  break;
                
                case 'complete':
                  console.log('🎉 Получено сообщение complete!');
                  console.log('📦 Данные доступны:', !!json.data);
                  console.log('⏱️ Время загрузки:', json.loadTime, 'мс');
                  
                  if (json.data && typeof json.data === 'object') {
                    // Direct data (non-chunked)
                    setData(json.data as DashboardData);
                    setLoading(false);
                    console.log(`✅ Данные успешно установлены`);
                  } else if (currentChunkedData && currentChunkedData.receivedChunks === currentChunkedData.totalChunks) {
                    // Chunked data completion
                    setLoading(false);
                    console.log(`✅ Chunked передача завершена`);
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
      }
      
      console.log('🏁 SSE поток завершен');
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