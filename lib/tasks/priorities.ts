/**
 * Уровни приоритета P0-P3
 */

export const PRIORITY_LEVELS = ['P0', 'P1', 'P2', 'P3'] as const

export type PriorityLevel = typeof PRIORITY_LEVELS[number]

/**
 * Описание уровней приоритета
 */
export const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  P0: 'Критический - требует немедленного внимания',
  P1: 'Высокий - важная задача',
  P2: 'Средний - обычная задача',
  P3: 'Низкий - можно отложить',
}

/**
 * CSS классы для приоритетов
 */
export function getPriorityClass(priority: string | null | undefined): string {
  switch (priority) {
    case 'P0':
      return 'bg-red-600 text-white border-red-500'
    case 'P1':
      return 'bg-orange-600 text-white border-orange-500'
    case 'P2':
      return 'bg-blue-600 text-white border-blue-500'
    case 'P3':
      return 'bg-gray-600 text-white border-gray-500'
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700'
  }
}
