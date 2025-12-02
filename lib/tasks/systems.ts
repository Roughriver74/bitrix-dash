/**
 * Маппинг названий проектов/эпиков на стандартизированные названия систем/продуктов
 */

export const SYSTEM_MAPPING: Record<string, string> = {
  // Проекты и эпики могут иметь разные названия, но мы приводим к стандартным (на русском)
  'crm': 'CRM',
  'битрикс24': 'Битрикс24',
  'bitrix24': 'Битрикс24',
  'битрикс': 'Битрикс24',
  'портал': 'Портал',
  'portal': 'Портал',
  'сайт': 'Сайт',
  'website': 'Сайт',
  'west': 'West',
  'api': 'API',
  'интеграция': 'Интеграция',
  'integration': 'Интеграция',
  'мобильное приложение': 'Мобильное приложение',
  'mobile': 'Мобильное приложение',
  'mobile app': 'Мобильное приложение',
  'dashboard': 'Дашборд',
  'дашборд': 'Дашборд',
  'админ': 'Админ',
  'admin': 'Админ',
  'backend': 'Backend',
  'frontend': 'Frontend',
  'infrastructure': 'Инфраструктура',
  'инфраструктура': 'Инфраструктура',
  'devops': 'DevOps',
  'testing': 'Тестирование',
  'тестирование': 'Тестирование',
  'документация': 'Документация',
  'documentation': 'Документация',
  'безопасность': 'Безопасность',
  'security': 'Безопасность',
  'bi': 'BI',
};

/**
 * Список всех доступных систем для dropdown (на русском)
 */
export const AVAILABLE_SYSTEMS = [
  'CRM',
  'Битрикс24',
  'Портал',
  'Сайт',
  'West',
  'API',
  'Интеграция',
  'Мобильное приложение',
  'Дашборд',
  'Админ',
  'Backend',
  'Frontend',
  'Инфраструктура',
  'DevOps',
  'Тестирование',
  'Документация',
  'Безопасность',
  'BI',
  'Другое',
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

  // Обработка разделителя @ (например, Bi@WEST -> BI)
  if (normalized.includes('@')) {
    const parts = normalized.split('@');
    const firstPart = parts[0].trim();
    if (SYSTEM_MAPPING[firstPart]) {
      return SYSTEM_MAPPING[firstPart];
    }
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
