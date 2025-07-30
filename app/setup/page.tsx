'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);

  useEffect(() => {
    // Check if already configured
    checkConfig();
  }, []);

  const checkConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        if (config.webhookUrl && config.departmentName) {
          // Already configured, redirect to dashboard
          router.push('/dashboard');
        }
      }
    } catch (error) {
      console.error('Error checking config:', error);
    } finally {
      setCheckingConfig(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate webhook URL format - allow any domain with /rest/ID/token/ structure
    if (!webhookUrl.match(/^https:\/\/[^\/]+\/rest\/\d+\/[\w-]+\/$/)) {
      setError('Неверный формат webhook URL. Убедитесь, что URL заканчивается на /');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl,
          departmentName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка сохранения конфигурации');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (checkingConfig) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Проверка конфигурации...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-white mb-6">Настройка дашборда</h1>
        
        {success ? (
          <div className="text-green-400 text-center">
            <div className="mb-4">✓ Конфигурация сохранена успешно!</div>
            <div className="text-gray-400">Перенаправление на дашборд...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="webhookUrl" className="block text-sm font-medium text-gray-300 mb-2">
                Webhook URL из Битрикс24
              </label>
              <input
                type="url"
                id="webhookUrl"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-domain.bitrix24.ru/rest/123/abc123/"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-400">
                Формат: https://домен.bitrix24.ru/rest/ID/токен/
              </p>
            </div>

            <div>
              <label htmlFor="departmentName" className="block text-sm font-medium text-gray-300 mb-2">
                Название отдела
              </label>
              <input
                type="text"
                id="departmentName"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                placeholder="IT отдел"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-400">
                Точное название отдела как в Битрикс24
              </p>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-600 rounded-md p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {loading ? 'Сохранение...' : 'Сохранить и продолжить'}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Инструкция по созданию webhook</h2>
          <ol className="space-y-2 text-sm text-gray-300">
            <li>1. В Битрикс24 перейдите в "Разработчикам" → "Другое" → "Входящий вебхук"</li>
            <li>2. Создайте новый вебхук с правами:
              <ul className="ml-4 mt-1 text-xs text-gray-400">
                <li>• tasks - чтение задач</li>
                <li>• user - чтение пользователей</li>
                <li>• department - чтение департаментов</li>
                <li>• calendar - чтение календаря</li>
              </ul>
            </li>
            <li>3. Скопируйте URL вебхука и вставьте выше</li>
          </ol>
        </div>
      </div>
    </div>
  );
}