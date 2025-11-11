/**
 * Маппинг названий проектов/эпиков на стандартизированные названия систем/продуктов
 */

export const SYSTEM_MAPPING: Record<string, string> = {
  // Проекты и эпики могут иметь разные названия, но мы приводим к стандартным
  'crm': 'CRM',
  'битрикс24': 'Bitrix24',
  'bitrix24': 'Bitrix24',
  'битрикс': 'Bitrix24',
  'портал': 'Portal',
  'сайт': 'Website',
  'west': 'West',
  'api': 'API',
  'интеграция': 'Integration',
  'integration': 'Integration',
  'мобильное приложение': 'Mobile App',
  'mobile': 'Mobile App',
  'dashboard': 'Dashboard',
  'дашборд': 'Dashboard',
  'админ': 'Admin',
  'admin': 'Admin',
  'backend': 'Backend',
  'frontend': 'Frontend',
  'infrastructure': 'Infrastructure',
  'инфраструктура': 'Infrastructure',
  'devops': 'DevOps',
  'testing': 'Testing',
  'тестирование': 'Testing',
  'документация': 'Documentation',
  'documentation': 'Documentation',
  'безопасность': 'Security',
  'security': 'Security',
};

/**
 * Список всех доступных систем для dropdown
 */
export const AVAILABLE_SYSTEMS = [
  'CRM',
  'Bitrix24',
  'Portal',
  'Website',
  'West',
  'API',
  'Integration',
  'Mobile App',
  'Dashboard',
  'Admin',
  'Backend',
  'Frontend',
  'Infrastructure',
  'DevOps',
  'Testing',
  'Documentation',
  'Security',
  'Other', // Для случаев, когда система не распознана
].sort();

/**
 * Нормализует название системы к стандартному виду
 * @param rawName Исходное название (из проекта или Epic)
 * @returns Стандартизированное название или 'Other'
 */
export function normalizeSystemName(rawName: string | undefined | null): string | null {
  if (!rawName || typeof rawName !== 'string') {
    return null;
  }

  const normalized = rawName.toLowerCase().trim();

  // Прямое совпадение
  if (SYSTEM_MAPPING[normalized]) {
    return SYSTEM_MAPPING[normalized];
  }

  // Поиск по частичному совпадению
  for (const [key, value] of Object.entries(SYSTEM_MAPPING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  // Если не нашли совпадение, возвращаем null (не устанавливаем систему)
  return null;
}

/**
 * Извлекает систему из названия задачи по префиксу
 * Формат: [SYSTEM] Task title или SYSTEM: Task title
 */
export function extractSystemFromTitle(title: string): string | null {
  if (!title) return null;

  // Ищем [SYSTEM] в начале
  const bracketMatch = title.match(/^\[([^\]]+)\]/);
  if (bracketMatch) {
    return normalizeSystemName(bracketMatch[1]);
  }

  // Ищем SYSTEM: в начале
  const colonMatch = title.match(/^([^:]+):/);
  if (colonMatch) {
    const candidate = colonMatch[1].trim();
    // Проверяем, что это не слишком длинная фраза (вероятно не система)
    if (candidate.length <= 20) {
      return normalizeSystemName(candidate);
    }
  }

  return null;
}
