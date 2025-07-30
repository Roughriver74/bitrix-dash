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

export async function readConfig(): Promise<AppConfig> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Return empty config if file doesn't exist
    return {
      webhookUrl: '',
      departmentName: ''
    };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
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