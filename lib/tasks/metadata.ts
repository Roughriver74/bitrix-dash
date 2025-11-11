import { BitrixTask } from '@/lib/bitrix/types'

export interface TaskMetadata {
	manualPriority?: number | null
	abc?: string | null
	impact?: string | null
	system?: string | null
	weight?: number | null
}

const TAG_PREFIXES = {
	manualPriority: 'priority:',
	abc: 'abc:',
	impact: 'impact:',
	system: 'system:',
	weight: 'weight:',
} as const

const ALL_PREFIXES = Object.values(TAG_PREFIXES)

export interface TaskWithMetadata extends BitrixTask {
	metadata: TaskMetadata
	otherTags: string[]
}

export function parseTaskMetadata(tags: string[] = []): {
	metadata: TaskMetadata
	otherTags: string[]
} {
	const metadata: TaskMetadata = {}
	const otherTags: string[] = []

	tags.forEach(rawTag => {
		if (!rawTag) {
			return
		}

		const tag = rawTag.trim()
		const lowerTag = tag.toLowerCase()

		if (lowerTag.startsWith(TAG_PREFIXES.manualPriority)) {
			const value = tag.slice(TAG_PREFIXES.manualPriority.length).trim()
			const numeric = Number(value)
			metadata.manualPriority = Number.isFinite(numeric) ? numeric : null
			return
		}

		if (lowerTag.startsWith(TAG_PREFIXES.abc)) {
			const value = tag.slice(TAG_PREFIXES.abc.length).trim()
			metadata.abc = value || null
			return
		}

		if (lowerTag.startsWith(TAG_PREFIXES.impact)) {
			const value = tag.slice(TAG_PREFIXES.impact.length).trim()
			metadata.impact = value || null
			return
		}

		if (lowerTag.startsWith(TAG_PREFIXES.system)) {
			const value = tag.slice(TAG_PREFIXES.system.length).trim()
			metadata.system = value || null
			return
		}

		if (lowerTag.startsWith(TAG_PREFIXES.weight)) {
			const value = tag.slice(TAG_PREFIXES.weight.length).trim()
			const numeric = Number(value)
			metadata.weight = Number.isFinite(numeric) ? numeric : null
			return
		}

		otherTags.push(tag)
	})

	return { metadata, otherTags }
}

export function buildMetadataTags(metadata: TaskMetadata = {}): string[] {
	const tags: string[] = []

	if (metadata.manualPriority != null) {
		tags.push(`${TAG_PREFIXES.manualPriority}${metadata.manualPriority}`)
	}

	if (metadata.abc) {
		tags.push(`${TAG_PREFIXES.abc}${metadata.abc}`)
	}

	if (metadata.impact) {
		tags.push(`${TAG_PREFIXES.impact}${metadata.impact}`)
	}

	if (metadata.system) {
		tags.push(`${TAG_PREFIXES.system}${metadata.system}`)
	}

	if (metadata.weight != null) {
		tags.push(`${TAG_PREFIXES.weight}${metadata.weight}`)
	}

	return tags
}

export function mergeTagsWithMetadata(
	existingTags: string[] = [],
	metadata: TaskMetadata = {}
): string[] {
	const filtered = existingTags.filter(tag => {
		if (!tag) return false
		const lower = tag.trim().toLowerCase()
		return !ALL_PREFIXES.some(prefix => lower.startsWith(prefix))
	})

	return [...filtered, ...buildMetadataTags(metadata)]
}

export function attachMetadata(task: BitrixTask): TaskWithMetadata {
	const tags = Array.isArray(task.TAGS) ? task.TAGS : []
	const { metadata, otherTags } = parseTaskMetadata(tags)

	return {
		...task,
		metadata,
		otherTags,
	}
}

export function statusCodeToName(status: string | number | undefined): string {
	const code = String(status ?? '')
	const statusMap: Record<string, string> = {
		'1': 'Новая',
		'2': 'Ждёт выполнения',
		'3': 'Выполняется',
		'4': 'Ждёт контроля',
		'5': 'Готово',
		'6': 'Отложена',
		'7': 'Отклонена',
	}

	const fallback = code || 'Неизвестно'
	return statusMap[code] ?? fallback
}

export function sortByManualPriority<T extends { metadata: TaskMetadata }>(
	tasks: T[]
): T[] {
	return [...tasks].sort((a, b) => {
		const aPriority = a.metadata.manualPriority ?? Number.POSITIVE_INFINITY
		const bPriority = b.metadata.manualPriority ?? Number.POSITIVE_INFINITY

		if (aPriority !== bPriority) {
			return aPriority - bPriority
		}

		return 0
	})
}

/**
 * Извлекает приоритет из начала названия задачи
 * Примеры:
 * "1. Задача" -> 1
 * "2 Другая задача" -> 2
 * "Задача без номера" -> null
 */
export function extractPriorityFromTitle(title: string): number | null {
	if (!title) return null

	// Ищем цифру в начале строки (с возможной точкой или скобкой после)
	const match = title.trim().match(/^(\d+)[.\s)]/);

	if (match && match[1]) {
		const priority = Number(match[1]);
		return Number.isFinite(priority) ? priority : null;
	}

	return null;
}
