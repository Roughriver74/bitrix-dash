import { BitrixClient } from './bitrix/client';
import { DepartmentService } from './bitrix/services/DepartmentService';

export interface AppConfig {
  webhookUrl: string;
  departmentName: string;
  updatedAt?: string;
}

// In-memory config cache (survives during single request lifecycle only)
// Used as temporary storage when /setup page writes config before env vars are set
let configCache: AppConfig | null = null;

export async function readConfig(): Promise<AppConfig> {
  // Priority 1: Environment variables (recommended for production on Vercel)
  if (process.env.BITRIX_WEBHOOK_URL && process.env.BITRIX_DEPARTMENT_NAME) {
    return {
      webhookUrl: process.env.BITRIX_WEBHOOK_URL,
      departmentName: process.env.BITRIX_DEPARTMENT_NAME,
      updatedAt: new Date().toISOString()
    };
  }

  // Priority 2: In-memory cache (temporary, lost on serverless cold start)
  if (configCache) {
    console.warn('⚠️ Используется in-memory кеш конфигурации. Для production настройте env переменные BITRIX_WEBHOOK_URL и BITRIX_DEPARTMENT_NAME');
    return configCache;
  }

  // No config found
  return {
    webhookUrl: '',
    departmentName: ''
  };
}

export async function writeConfig(config: AppConfig): Promise<void> {
  // Store in in-memory cache only
  // Note: This cache is lost on serverless function cold starts
  configCache = config;

  console.warn(`
⚠️ Конфигурация сохранена в in-memory кеш (временно).

Для production на Vercel:
1. Добавьте переменные окружения в настройках проекта:
   - BITRIX_WEBHOOK_URL="${config.webhookUrl}"
   - BITRIX_DEPARTMENT_NAME="${config.departmentName}"

2. Или используйте файл .env.local для локальной разработки.

In-memory кеш очищается при каждом холодном старте serverless функции.
  `);
}

export async function validateConfig(webhookUrl: string, departmentName: string): Promise<boolean> {
  try {
    // Test the webhook connection
    const client = new BitrixClient(webhookUrl);
    const deptService = new DepartmentService(client);

    // Try to find the department
    const department = await deptService.getDepartmentByName(departmentName);

    return !!department;
  } catch (error) {
    console.error('❌ Config validation error:', error);
    return false;
  }
}

export async function getConfiguredWebhookUrl(): Promise<string> {
  const config = await readConfig();

  if (!config.webhookUrl) {
    throw new Error('Webhook URL не настроен. Настройте переменные окружения BITRIX_WEBHOOK_URL и BITRIX_DEPARTMENT_NAME или перейдите на /setup для временной настройки.');
  }

  return config.webhookUrl;
}

export async function getConfiguredDepartmentName(): Promise<string> {
  const config = await readConfig();

  if (!config.departmentName) {
    // Fallback to default department name
    console.warn('⚠️ BITRIX_DEPARTMENT_NAME не настроен, используется значение по умолчанию: "IT отдел"');
    return 'IT отдел';
  }

  return config.departmentName;
}