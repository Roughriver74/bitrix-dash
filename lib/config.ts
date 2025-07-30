import fs from 'fs/promises';
import path from 'path';
import { BitrixClient } from './bitrix/client';
import { DepartmentService } from './bitrix/services/DepartmentService';

export interface AppConfig {
  webhookUrl: string;
  departmentName: string;
  updatedAt?: string;
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// In-memory config cache for Vercel
let configCache: AppConfig | null = null;

export async function readConfig(): Promise<AppConfig> {
  // Check environment variables first (for Vercel)
  if (process.env.BITRIX_WEBHOOK_URL && process.env.BITRIX_DEPARTMENT_NAME) {
    return {
      webhookUrl: process.env.BITRIX_WEBHOOK_URL,
      departmentName: process.env.BITRIX_DEPARTMENT_NAME,
      updatedAt: new Date().toISOString()
    };
  }

  // Check cache
  if (configCache) {
    return configCache;
  }

  // Try to read from file (for local development)
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsedConfig = JSON.parse(data);
    configCache = parsedConfig;
    return parsedConfig;
  } catch (error) {
    // Return empty config if file doesn't exist
    return {
      webhookUrl: '',
      departmentName: ''
    };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  // Update cache
  configCache = config;
  
  // Try to write to file (will fail on Vercel, but that's ok)
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    // Ignore file write errors on Vercel
    console.log('Config saved in memory only (file system not available)');
  }
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
    console.error('Config validation error:', error);
    return false;
  }
}

export async function getConfiguredWebhookUrl(): Promise<string> {
  // First check environment variable (for backwards compatibility)
  if (process.env.BITRIX_WEBHOOK_URL) {
    return process.env.BITRIX_WEBHOOK_URL;
  }
  
  // Then check config file
  const config = await readConfig();
  if (!config.webhookUrl) {
    throw new Error('Webhook URL не настроен. Перейдите на /setup для настройки.');
  }
  
  return config.webhookUrl;
}

export async function getConfiguredDepartmentName(): Promise<string> {
  // Check config file
  const config = await readConfig();
  if (!config.departmentName) {
    // Fallback to hardcoded value for backwards compatibility
    return 'IT отдел';
  }
  
  return config.departmentName;
}