'use client'

import { CSS } from '@dnd-kit/utilities'
import {
	DndContext,
	DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVertical, Check, Edit, Trash2, X, ChevronDown, ChevronRight, BarChart3, Minimize2, Maximize2, AlertCircle, Search, EyeOff, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { TaskListItem } from '@/components/tasks/types'
import { PRIORITY_LEVELS, getPriorityClass } from '@/lib/tasks/priorities'
import { AVAILABLE_SYSTEMS } from '@/lib/tasks/systems'

type GroupBy = 'none' | 'abc' | 'status' | 'responsible' | 'impact' | 'priority'

interface TaskTableProps {
	tasks: TaskListItem[]
	loading?: boolean
	isAdminMode?: boolean
	systems?: string[]
	onReorder: (tasks: TaskListItem[]) => void
	onEdit: (task: TaskListItem) => void
	onComplete: (task: TaskListItem) => void
	onDelete: (task: TaskListItem) => void
	onUpdate?: (
		taskId: string,
		updates: {
			fields?: {
				title?: string
				description?: string
				responsibleId?: string
				deadline?: string
				status?: string
				ufCrmTask?: string[]
			}
			metadata?: {
				manualPriority?: number | null
				abc?: string | null
				impact?: string | null
				system?: string | null
				p?: string | null
				weight?: number | null
			}
			tags?: string[]
			otherTags?: string[]
		}
	) => Promise<void>
	onSync?: () => void
}

export function TaskTable({
	tasks,
	loading,
	isAdminMode = false,
	systems = [],
	onReorder,
	onEdit,
	onComplete,
	onDelete,
	onUpdate,
	onSync,
}: TaskTableProps) {
	const [filters, setFilters] = useState({
		abc: '',
		status: '',
		impact: '',
		system: '',
		p: '',
		responsibleName: '',
		searchQuery: '',
	})
	const [hideRequests, setHideRequests] = useState(true)
	const [groupBy, setGroupBy] = useState<GroupBy>('priority')
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
	const [showStats, setShowStats] = useState(false)
	const [compactMode, setCompactMode] = useState(false)
	const [excludedTaskIds, setExcludedTaskIds] = useState<Set<string>>(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('excludedTaskIds')
			return new Set(saved ? JSON.parse(saved) : [])
		}
		return new Set()
	})

	// Объединяем статический список систем с системами из БД
	const availableSystems = useMemo(() => {
		const combined = new Set([...AVAILABLE_SYSTEMS, ...systems])
		return Array.from(combined).sort()
	}, [systems])

	useEffect(() => {
		localStorage.setItem('excludedTaskIds', JSON.stringify(Array.from(excludedTaskIds)))
	}, [excludedTaskIds])

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 6,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	)

	// Фильтруем задачи
	const filteredTasks = useMemo(() => {
		return tasks.filter(task => {
			if (excludedTaskIds.has(task.id)) return false
			if (filters.abc && task.metadata.abc !== filters.abc) return false
			if (filters.status && task.status !== filters.status) return false
			if (filters.impact && task.metadata.impact !== filters.impact) return false
			if (
				filters.system &&
				!task.metadata.system?.toLowerCase().includes(filters.system.toLowerCase())
			)
				return false
			if (filters.p && task.metadata.p !== filters.p) return false
			if (
				filters.responsibleName &&
				!task.responsibleName?.toLowerCase().includes(filters.responsibleName.toLowerCase())
			)
				return false
			// Фильтр "Заявки" - исключаем задачи со словом "Заявка" в названии или тегами BUG, FIN
			if (hideRequests) {
				const hasHiddenTag = task.tags.some(tag => 
					['BUG', 'FIN'].includes(tag.toUpperCase())
				)
				if (task.title.toLowerCase().includes('заявка') || hasHiddenTag) {
					return false
				}
			}
			if (
				filters.searchQuery &&
				!task.title.toLowerCase().includes(filters.searchQuery.toLowerCase())
			)
				return false
			return true
		})
	}, [tasks, filters, hideRequests])

	const clearFilters = () => {
		setFilters({
			abc: '',
			status: '',
			impact: '',
			system: '',
			p: '',
			responsibleName: '',
			searchQuery: '',
		})
		setHideRequests(false)
	}

	const hasActiveFilters = Object.values(filters).some(f => f !== '') || hideRequests

	// Сортируем задачи по приоритету P0-P3
	const sortedTasks = useMemo(() => {
		const priorityOrder: Record<string, number> = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 }

		// Добавляем индекс для стабильной сортировки
		const tasksWithIndex = filteredTasks.map((task, index) => ({ task, index }))

		const sorted = tasksWithIndex.sort((a, b) => {
			const aPriority = a.task.metadata.p
			const bPriority = b.task.metadata.p

			// Задачи с приоритетом идут перед задачами без приоритета
			if (aPriority && !bPriority) return -1
			if (!aPriority && bPriority) return 1

			// Обе имеют приоритет - сортируем по значению P0 -> P1 -> P2 -> P3
			if (aPriority && bPriority) {
				const aOrder = priorityOrder[aPriority] ?? 999
				const bOrder = priorityOrder[bPriority] ?? 999
				if (aOrder !== bOrder) return aOrder - bOrder
			}

			// Если приоритеты одинаковые или обе без приоритета - сохраняем исходный порядок
			return a.index - b.index
		})

		return sorted.map(item => item.task)
	}, [filteredTasks])

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) {
			return
		}

		// Используем sortedTasks для правильного определения индексов
		const oldIndex = sortedTasks.findIndex(task => task.id === active.id)
		const newIndex = sortedTasks.findIndex(task => task.id === over.id)
		if (oldIndex === -1 || newIndex === -1) {
			return
		}

		// Перемещаем в отсортированном списке
		const reorderedFiltered = arrayMove(sortedTasks, oldIndex, newIndex)

		// Обновляем только визуальный порядок (order), НЕ трогая manualPriority
		const reordered = reorderedFiltered.map((task, index) => ({
			...task,
			order: index + 1,
		}))

		// Объединяем с неотфильтрованными задачами, сохраняя их порядок
		const taskMap = new Map(reordered.map(t => [t.id, t]))
		const finalTasks = tasks.map(task => taskMap.get(task.id) || task)

		onReorder(finalTasks)
	}

	// Получаем уникальные значения для фильтров
	const uniqueStatuses = useMemo(() => {
		const statuses = new Set(tasks.map(t => t.status))
		return Array.from(statuses).sort()
	}, [tasks])

	const uniqueImpacts = useMemo(() => {
		const impacts = new Set(
			tasks.map(t => t.metadata.impact).filter((i): i is string => !!i)
		)
		return Array.from(impacts).sort()
	}, [tasks])

	// Статистика
	const stats = useMemo(() => {
		return {
			total: sortedTasks.length,
			byAbc: {
				A: sortedTasks.filter(t => t.metadata.abc === 'A').length,
				B: sortedTasks.filter(t => t.metadata.abc === 'B').length,
				C: sortedTasks.filter(t => t.metadata.abc === 'C').length,
				none: sortedTasks.filter(t => !t.metadata.abc).length,
			},
			byStatus: {
				new: sortedTasks.filter(t => t.status === '1').length,
				waiting: sortedTasks.filter(t => t.status === '2').length,
				inProgress: sortedTasks.filter(t => t.status === '3').length,
				control: sortedTasks.filter(t => t.status === '4').length,
				completed: sortedTasks.filter(t => t.status === '5').length,
				deferred: sortedTasks.filter(t => t.status === '6').length,
				declined: sortedTasks.filter(t => t.status === '7').length,
			},
			byImpact: {
				high: sortedTasks.filter(t => t.metadata.impact === 'Сильное').length,
				medium: sortedTasks.filter(t => t.metadata.impact === 'Умеренное').length,
				low: sortedTasks.filter(t => t.metadata.impact === 'Слабое').length,
			},
			overdue: sortedTasks.filter(t => t.isOverdue).length,
		}
	}, [sortedTasks])

	// Группировка задач
	const groupedTasks = useMemo(() => {
		if (groupBy === 'none') {
			return { 'Все задачи': sortedTasks }
		}

		const groups: Record<string, TaskListItem[]> = {}

		sortedTasks.forEach(task => {
			let groupKey = 'Без группы'

			switch (groupBy) {
				case 'abc':
					groupKey = task.metadata.abc ? `ABC: ${task.metadata.abc}` : 'ABC: Не задано'
					break
				case 'status':
					const statusMap: Record<string, string> = {
						'1': 'Новая',
						'2': 'Ждёт выполнения',
						'3': 'Выполняется',
						'4': 'Ждёт контроля',
						'5': 'Завершена',
						'6': 'Отложена',
						'7': 'Отклонена',
					}
					groupKey = statusMap[task.status] || task.status
					break
				case 'responsible':
					groupKey = task.responsibleName || 'Без ответственного'
					break
				case 'impact':
					groupKey = task.metadata.impact
						? `Влияние: ${task.metadata.impact}`
						: 'Влияние: Не задано'
					break
				case 'priority':
					groupKey = task.metadata.p || 'Без приоритета'
					break
			}

			if (!groups[groupKey]) {
				groups[groupKey] = []
			}
			groups[groupKey].push(task)
		})

		return groups
	}, [sortedTasks, groupBy])

	const toggleGroup = (groupKey: string) => {
		setCollapsedGroups(prev => {
			const newSet = new Set(prev)
			if (newSet.has(groupKey)) {
				newSet.delete(groupKey)
			} else {
				newSet.add(groupKey)
			}
			return newSet
		})
	}

	// Быстрые фильтры
	const applyQuickFilter = (type: 'myTasks' | 'urgent' | 'today' | 'highPriority') => {
		clearFilters()
		switch (type) {
			case 'urgent':
				// Фильтр для срочных задач (статус "Выполняется" или просроченные)
				setFilters(prev => ({ ...prev, status: '3' }))
				break
			case 'highPriority':
				// Высокий приоритет - задачи ABC: A
				setFilters(prev => ({ ...prev, abc: 'A' }))
				break
		}
	}

	const handleExclude = (taskId: string) => {
		setExcludedTaskIds(prev => {
			const newSet = new Set(prev)
			newSet.add(taskId)
			return newSet
		})
	}

	return (
		<div className='overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-900/95 shadow-2xl backdrop-blur-sm'>
			{/* Панель управления */}
			<div className='bg-gradient-to-r from-gray-800/60 via-gray-800/50 to-gray-800/60 px-4 py-3 border-b border-gray-700/50 backdrop-blur-md'>
				<div className='flex flex-wrap items-center gap-3'>
					{/* Синхронизация */}
					{onSync && (
						<button
							onClick={onSync}
							disabled={loading}
							className={clsx(
								'flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition hover:bg-blue-500/20 hover:text-blue-300',
								loading && 'opacity-50 cursor-not-allowed'
							)}
							title='Синхронизировать с Bitrix24'
						>
							<RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
							Sync
						</button>
					)}

					{/* Группировка */}
					<div className='flex items-center gap-2'>
						<label className='text-xs text-gray-400'>Группировать:</label>
						<select
							value={groupBy}
							onChange={e => setGroupBy(e.target.value as GroupBy)}
							className='px-3 py-1.5 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded-md focus:border-blue-500 focus:outline-none'
						>
							<option value='none'>Без группировки</option>
							<option value='abc'>По ABC</option>
							<option value='status'>По статусу</option>
							<option value='responsible'>По ответственному</option>
							<option value='impact'>По влиянию</option>
							<option value='priority'>По приоритету</option>
						</select>
					</div>

					{/* Поиск */}
					<div className='relative ml-4'>
						<Search className='absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500' />
						<input
							type='text'
							placeholder='Поиск по названию...'
							value={filters.searchQuery}
							onChange={e =>
								setFilters(prev => ({ ...prev, searchQuery: e.target.value }))
							}
							className='pl-8 pr-3 py-1.5 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded-md focus:border-blue-500 focus:outline-none w-48'
						/>
					</div>

					{/* Быстрые фильтры */}
					<div className='flex items-center gap-2 ml-4'>
						<span className='text-xs text-gray-400'>Быстро:</span>
						<button
							onClick={() => applyQuickFilter('urgent')}
							className={clsx(
								'px-3 py-1.5 text-xs rounded-md transition-all duration-200 border font-medium',
								filters.status === '3'
									? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20 scale-105'
									: 'bg-gray-900 text-gray-300 border-gray-700 hover:border-blue-500 hover:shadow-md hover:scale-102 active:scale-95'
							)}
						>
							В работе
						</button>
						<button
							onClick={() => applyQuickFilter('highPriority')}
							className={clsx(
								'px-3 py-1.5 text-xs rounded-md transition-all duration-200 border font-medium',
								filters.abc === 'A'
									? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20 scale-105'
									: 'bg-gray-900 text-gray-300 border-gray-700 hover:border-emerald-500 hover:shadow-md hover:scale-102 active:scale-95'
							)}
						>
							Группа A
						</button>
						<button
							onClick={() => setHideRequests(!hideRequests)}
							className={clsx(
								'px-3 py-1.5 text-xs rounded-md transition-all duration-200 border font-medium',
								hideRequests
									? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20 scale-105'
									: 'bg-gray-900 text-gray-300 border-gray-700 hover:border-purple-500 hover:shadow-md hover:scale-102 active:scale-95'
							)}
						>
							{hideRequests ? 'Заявки скрыты' : 'Скрыть заявки'}
						</button>
						{stats.overdue > 0 && (
							<button
								className='px-3 py-1.5 text-xs rounded-md transition border bg-red-900/40 text-red-200 border-red-700/60 hover:bg-red-900/60'
							>
								Просрочено: {stats.overdue}
							</button>
						)}
					</div>

					{/* Компактный режим и статистика */}
					<div className='ml-auto flex items-center gap-2'>
						<button
							onClick={() => setCompactMode(!compactMode)}
							className='px-3 py-1.5 text-xs rounded-md transition border bg-gray-900 text-gray-300 border-gray-700 hover:border-blue-500 flex items-center gap-1.5'
							title={compactMode ? 'Обычный режим' : 'Компактный режим'}
						>
							{compactMode ? (
								<Maximize2 className='h-3.5 w-3.5' />
							) : (
								<Minimize2 className='h-3.5 w-3.5' />
							)}
							{compactMode ? 'Обычный' : 'Компактный'}
						</button>
						<button
							onClick={() => setShowStats(!showStats)}
							className='px-3 py-1.5 text-xs rounded-md transition border bg-gray-900 text-gray-300 border-gray-700 hover:border-blue-500 flex items-center gap-1.5'
						>
							<BarChart3 className='h-3.5 w-3.5' />
							Статистика
						</button>
					</div>
				</div>

				{/* Статистика развернутая */}
				{showStats && (
					<div className='mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-3'>
						<div className='bg-gray-900/50 rounded-lg p-3 border border-gray-700'>
							<div className='text-xs text-gray-400 mb-1'>По ABC</div>
							<div className='flex gap-2 text-xs'>
								<span className='text-emerald-400'>A: {stats.byAbc.A}</span>
								<span className='text-amber-400'>B: {stats.byAbc.B}</span>
								<span className='text-sky-400'>C: {stats.byAbc.C}</span>
							</div>
						</div>
						<div className='bg-gray-900/50 rounded-lg p-3 border border-gray-700'>
							<div className='text-xs text-gray-400 mb-1'>По статусу</div>
							<div className='flex flex-col gap-0.5 text-xs'>
								<span className='text-blue-400'>В работе: {stats.byStatus.inProgress}</span>
								<span className='text-yellow-400'>Ожидает: {stats.byStatus.waiting}</span>
								<span className='text-green-400'>Готово: {stats.byStatus.completed}</span>
							</div>
						</div>
						<div className='bg-gray-900/50 rounded-lg p-3 border border-gray-700'>
							<div className='text-xs text-gray-400 mb-1'>По влиянию</div>
							<div className='flex flex-col gap-0.5 text-xs'>
								<span className='text-red-400'>Сильное: {stats.byImpact.high}</span>
								<span className='text-orange-400'>Умеренное: {stats.byImpact.medium}</span>
								<span className='text-yellow-400'>Слабое: {stats.byImpact.low}</span>
							</div>
						</div>
						<div className='bg-gray-900/50 rounded-lg p-3 border border-gray-700'>
							<div className='text-xs text-gray-400 mb-1'>Всего</div>
							<div className='text-2xl font-bold text-white'>{stats.total}</div>
						</div>
					</div>
				)}
			</div>

			{hasActiveFilters && (
				<div className='bg-gray-800/30 px-4 py-2 border-b border-gray-700 flex items-center justify-between'>
					<span className='text-xs text-gray-400'>
						Показано {filteredTasks.length} из {tasks.length} задач
					</span>
					<button
						onClick={clearFilters}
						className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
					>
						<X className='h-3 w-3' />
						Сбросить фильтры
					</button>
				</div>
			)}

			{/* Мобильный карточный вид */}
			<div className='block lg:hidden'>
				<div className='p-4 space-y-3'>
					{loading && filteredTasks.length === 0 ? (
						Array.from({ length: 3 }).map((_, idx) => (
							<div key={`skeleton-card-${idx}`} className='rounded-lg bg-gray-800/50 p-4 animate-pulse'>
								<div className='h-5 w-3/4 bg-gray-700 rounded mb-3'></div>
								<div className='h-4 w-full bg-gray-700 rounded mb-2'></div>
								<div className='h-4 w-2/3 bg-gray-700 rounded'></div>
							</div>
						))
					) : filteredTasks.length === 0 ? (
						<div className='text-center py-12 text-gray-400'>
							{tasks.length === 0
								? 'Задачи не найдены. Добавьте первую задачу.'
								: 'Нет задач, соответствующих фильтрам.'}
						</div>
					) : (
						sortedTasks.map((task) => (
							<div
								key={task.id}
								className='rounded-lg bg-gradient-to-br from-gray-800/60 to-gray-800/40 border border-gray-700/50 p-4 space-y-3 hover:shadow-xl hover:border-gray-600 transition-all duration-200'
							>
								<div className='flex items-start justify-between gap-2'>
									<div className='flex-1 min-w-0'>
										<div className='flex items-center gap-2 mb-1'>
											<span className='text-xs font-bold text-gray-500'>#{task.order}</span>
											{task.metadata.abc && (
												<span className={clsx(
													'text-xs px-2 py-0.5 rounded-full font-bold',
													getAbcClass(task.metadata.abc)
												)}>
													{task.metadata.abc}
												</span>
											)}
											<a
												href={`https://crmwest.ru/company/personal/user/156/tasks/task/view/${task.id}/`}
												target='_blank'
												rel='noopener noreferrer'
												className='text-xs text-blue-400 hover:text-blue-300 font-mono'
											>
												ID: {task.id}
											</a>
										</div>
										<h3 className='font-semibold text-white text-sm mb-1 break-words'>{task.title}</h3>
										{task.description && (
											<p className='text-xs text-gray-400 line-clamp-2 mb-2'>{task.description}</p>
										)}
									</div>
								</div>

								<div className='grid grid-cols-2 gap-2 text-xs'>
									<div>
										<span className='text-gray-500'>Ответственный:</span>
										<p className='text-gray-300 font-medium'>{task.responsibleName || '—'}</p>
									</div>
									<div>
										<span className='text-gray-500'>Статус:</span>
										<div className='mt-1'><StatusBadge status={task.status} label={task.statusName} /></div>
									</div>
									{task.deadline && (
										<div>
											<span className='text-gray-500'>Дедлайн:</span>
											<p className={clsx(
												'text-gray-300 font-medium',
												task.isOverdue && 'text-red-400'
											)}>
												{new Date(task.deadline).toLocaleString('ru-RU', {
													day: '2-digit',
													month: '2-digit',
													hour: '2-digit',
													minute: '2-digit',
												})}
											</p>
										</div>
									)}
									{task.metadata.impact && (
										<div>
											<span className='text-gray-500'>Влияние:</span>
											<p className='text-gray-300'>{task.metadata.impact}</p>
										</div>
									)}
								</div>

								{task.tags.length > 0 && (
									<div className='flex flex-wrap gap-1'>
										{task.tags.map((tag, idx) => (
											<span
												key={`${task.id}-mobile-tag-${idx}`}
												className='rounded bg-gray-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400'
											>
												{tag}
											</span>
										))}
									</div>
								)}

								<div className='flex justify-end gap-2 pt-2 border-t border-gray-700/50'>
									<button
										type='button'
										onClick={() => onComplete(task)}
										className='group rounded-lg border border-green-600/50 px-3 py-1.5 text-xs font-semibold text-green-400 transition-all duration-200 hover:bg-green-600/20'
									>
										<Check className='h-3.5 w-3.5' />
									</button>
									<button
										type='button'
										onClick={() => onEdit(task)}
										className='group rounded-lg border border-blue-600/50 px-3 py-1.5 text-xs font-semibold text-blue-400 transition-all duration-200 hover:bg-blue-600/20'
									>
										<Edit className='h-3.5 w-3.5' />
									</button>
									<button
										type='button'
										onClick={() => onDelete(task)}
										className='group rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-600/20'
									>
										<Trash2 className='h-3.5 w-3.5' />
									</button>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			{/* Десктопный табличный вид */}
			<div className='hidden lg:block overflow-x-auto'>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={isAdminMode ? handleDragEnd : undefined}
				>
					<SortableContext
						items={sortedTasks.map(task => task.id)}
						strategy={verticalListSortingStrategy}
					>
						<table className='w-full border-collapse table-auto'>
							<thead className='bg-gray-800/70 sticky top-0 z-10'>
								<tr className='text-left text-sm font-medium text-gray-300'>
									<th className='w-12 px-4 py-3'>#</th>
									<th className='w-12 px-4 py-3'></th>
									<th className='w-20 px-4 py-3'>ID</th>
									<th className='w-20 px-4 py-3'>ABC</th>
									<th className='px-4 py-3 min-w-[300px]'>Задача</th>
									<th className='w-40 px-4 py-3'>Ответственный</th>
									<th className='w-32 px-4 py-3'>Статус</th>
									<th className='w-32 px-4 py-3'>Дедлайн</th>
									<th className='w-20 px-4 py-3'>Вес</th>
									<th className='w-36 px-4 py-3'>Влияние</th>
									<th className='w-32 px-4 py-3'>Система</th>
									<th className='w-24 px-4 py-3'>Приоритет</th>
									<th className='w-32 px-4 py-3 text-right'>Действия</th>
								</tr>
								<tr className='bg-gray-800/90 border-t border-gray-700'>
									<th className='px-2 py-2'></th>
									<th className='px-2 py-2'></th>
									<th className='px-2 py-2'></th>
									<th className='px-2 py-2'>
										<select
											value={filters.abc}
											onChange={e =>
												setFilters(prev => ({ ...prev, abc: e.target.value }))
											}
											className='w-full px-2 py-1 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded focus:border-blue-500 focus:outline-none'
										>
											<option value=''>Все</option>
											<option value='A'>A</option>
											<option value='B'>B</option>
											<option value='C'>C</option>
										</select>
									</th>
									<th className='px-2 py-2'></th>
									<th className='px-2 py-2'>
										<input
											type='text'
											placeholder='Фильтр...'
											value={filters.responsibleName}
											onChange={e =>
												setFilters(prev => ({
													...prev,
													responsibleName: e.target.value,
												}))
											}
											className='w-full px-2 py-1 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded focus:border-blue-500 focus:outline-none placeholder-gray-600'
										/>
									</th>
									<th className='px-2 py-2'>
										<select
											value={filters.status}
											onChange={e =>
												setFilters(prev => ({ ...prev, status: e.target.value }))
											}
											className='w-full px-2 py-1 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded focus:border-blue-500 focus:outline-none'
										>
											<option value=''>Все</option>
											{uniqueStatuses.map(status => (
												<option key={status} value={status}>
													{status === '1'
														? 'Новая'
														: status === '2'
														? 'Ждёт'
														: status === '3'
														? 'Выполняется'
														: status === '4'
														? 'Контроль'
														: status === '5'
														? 'Готово'
														: status === '6'
														? 'Отложена'
														: status === '7'
														? 'Отклонена'
														: status}
												</option>
											))}
										</select>
									</th>
									<th className='px-2 py-2'></th>
									<th className='px-2 py-2'></th>
									<th className='px-2 py-2'>
										<select
											value={filters.impact}
											onChange={e =>
												setFilters(prev => ({ ...prev, impact: e.target.value }))
											}
											className='w-full px-2 py-1 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded focus:border-blue-500 focus:outline-none'
										>
											<option value=''>Все</option>
											{uniqueImpacts.map(impact => (
												<option key={impact} value={impact}>
													{impact}
												</option>
											))}
										</select>
									</th>
									<th className='px-2 py-2'>
										<input
											type='text'
											placeholder='Фильтр...'
											value={filters.system}
											onChange={e =>
												setFilters(prev => ({ ...prev, system: e.target.value }))
											}
											className='w-full px-2 py-1 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded focus:border-blue-500 focus:outline-none placeholder-gray-600'
										/>
									</th>
									<th className='px-2 py-2'>
										<select
											value={filters.p}
											onChange={e =>
												setFilters(prev => ({ ...prev, p: e.target.value }))
											}
											className='w-full px-2 py-1 text-xs bg-gray-900 text-gray-300 border border-gray-700 rounded focus:border-blue-500 focus:outline-none'
										>
											<option value=''>Все</option>
											{PRIORITY_LEVELS.map(level => (
												<option key={level} value={level}>
													{level}
												</option>
											))}
										</select>
									</th>
									<th className='px-2 py-2'></th>
								</tr>
							</thead>
							<tbody className='text-sm text-gray-200'>
								{loading && filteredTasks.length === 0 ? (
									// Skeleton loading state
									Array.from({ length: 5 }).map((_, idx) => (
										<tr key={`skeleton-${idx}`} className='border-b border-gray-800'>
											<td className='px-4 py-4'>
												<div className='h-4 w-8 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-4 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-16 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-6 w-12 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-full bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-32 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-20 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-24 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-12 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-20 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='h-4 w-20 bg-gray-800 rounded animate-pulse'></div>
											</td>
											<td className='px-4 py-4'>
												<div className='flex gap-2 justify-end'>
													<div className='h-8 w-8 bg-gray-800 rounded animate-pulse'></div>
													<div className='h-8 w-8 bg-gray-800 rounded animate-pulse'></div>
													<div className='h-8 w-8 bg-gray-800 rounded animate-pulse'></div>
												</div>
											</td>
										</tr>
									))
								) : filteredTasks.length === 0 ? (
									<tr>
										<td
											colSpan={12}
											className='px-6 py-12 text-center text-gray-400'
										>
											{tasks.length === 0
												? 'Задачи не найдены. Добавьте первую задачу.'
												: 'Нет задач, соответствующих фильтрам.'}
										</td>
									</tr>
								) : (groupBy === 'none' || filters.searchQuery) ? (
									sortedTasks.map((task, index) => (
										<SortableRow
											key={task.id}
											task={task}
											index={index}
											isAdminMode={isAdminMode}
											onEdit={onEdit}
											onComplete={onComplete}
											onDelete={onDelete}
											onExclude={() => handleExclude(task.id)}
											compactMode={compactMode}
											onUpdate={onUpdate}
										/>
									))
								) : (
									Object.entries(groupedTasks).map(([groupKey, groupTasks]) => {
										const isCollapsed = collapsedGroups.has(groupKey)
										return (
											<React.Fragment key={`group-${groupKey}`}>
												<tr className='bg-gray-800/60 sticky top-[88px] z-[5] border-t-2 border-gray-700'>
													<td colSpan={12} className='px-4 py-2'>
														<button
															onClick={() => toggleGroup(groupKey)}
															className='flex items-center gap-2 text-sm font-semibold text-gray-200 hover:text-white transition w-full'
														>
															{isCollapsed ? (
																<ChevronRight className='h-4 w-4' />
															) : (
																<ChevronDown className='h-4 w-4' />
															)}
															<span>{groupKey}</span>
															<span className='text-xs text-gray-400 ml-2'>
																({groupTasks.length}{' '}
																{groupTasks.length === 1 ? 'задача' : 'задач'})
															</span>
														</button>
													</td>
												</tr>
												{!isCollapsed &&
													groupTasks.map((task, index) => (
														<SortableRow
															key={task.id}
															task={task}
															index={index}
															isAdminMode={isAdminMode}
															onEdit={onEdit}
															onComplete={onComplete}
															onDelete={onDelete}
															onExclude={() => handleExclude(task.id)}
															compactMode={compactMode}
															onUpdate={onUpdate}
														/>
													))}
											</React.Fragment>
										)
									})
								)}
							</tbody>
						</table>
					</SortableContext>
				</DndContext>
			</div>
		</div>
	)
}

interface SortableRowProps {
	task: TaskListItem
	onEdit: (task: TaskListItem) => void
	onComplete: (task: TaskListItem) => void
	onDelete: (task: TaskListItem) => void
	onExclude: () => void
	compactMode?: boolean
	isAdminMode?: boolean
	index: number
	onUpdate?: (
		taskId: string,
		updates: {
			fields?: {
				title?: string
				description?: string
				responsibleId?: string
				deadline?: string
				status?: string
			}
			metadata?: {
				abc?: string | null
				impact?: string | null
				system?: string | null
				p?: string | null
				weight?: number | null
			}
			otherTags?: string[]
		}
	) => Promise<void>
}

function SortableRow({
	task,
	onEdit,
	onComplete,
	onDelete,
	onExclude,
	compactMode = false,
	isAdminMode = false,
	onUpdate,
	index,
}: SortableRowProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: task.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	const deadline = task.deadline
		? new Date(task.deadline).toLocaleString('ru-RU', {
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
		  })
		: '—'

	// Цветовая индикация строки
	const rowColorClass = getRowColorClass(task)

	// Классы для компактного режима
	const cellPadding = compactMode ? 'px-3 py-1.5' : 'px-4 py-3'

	return (
		<tr
			ref={setNodeRef}
			style={style}
			className={clsx(
				'border-t border-gray-800 transition-all duration-200 group',
				isDragging
					? 'bg-blue-900/40 shadow-2xl scale-102 z-50'
					: rowColorClass || 'hover:bg-gray-800/60 hover:shadow-lg',
				compactMode && 'text-xs'
			)}
		>
			<td className={clsx(cellPadding, 'text-sm font-semibold text-gray-400 relative')}>
				{task.isOverdue && (
					<span className='absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-pulse' />
				)}
				{index + 1}
			</td>
			<td className={clsx(cellPadding, 'text-gray-500')}>
				<button
					type='button'
					className={clsx(
						'rounded p-2 transition',
						isAdminMode 
							? 'cursor-grab hover:bg-gray-800 hover:text-white active:cursor-grabbing' 
							: 'cursor-default text-gray-700'
					)}
					{...attributes}
					{...(isAdminMode ? listeners : {})}
				>
					<GripVertical className='h-4 w-4' />
				</button>
			</td>
			<td className={cellPadding}>
				<a
					href={`https://crmwest.ru/company/personal/user/156/tasks/task/view/${task.id}/`}
					target='_blank'
					rel='noopener noreferrer'
					className='text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs'
				>
					{task.id}
				</a>
			</td>
			<td className={cellPadding}>
				<InlineSelect
					value={task.metadata.abc ?? ''}
					options={['A', 'B', 'C']}
					onChange={value => {
						onUpdate?.(task.id, {
							metadata: {
								...task.metadata,
								abc: value || null,
							},
						})
					}}
					className={getAbcClass(task.metadata.abc)}
					placeholder='—'
					disabled={!isAdminMode}
				/>
			</td>
			<td className={clsx(cellPadding, 'align-top')}>
				<div className={clsx('space-y-1 max-w-md', compactMode && 'space-y-0.5')}>
					<div className='font-semibold text-white break-words'>
						{task.title}
					</div>
					{!compactMode && task.description && (
						<p className='text-xs text-gray-400 line-clamp-3 max-h-[4.5rem] overflow-hidden break-words'>
							{task.description}
						</p>
					)}
					{task.tags.length > 0 && !compactMode && (
						<div className='flex flex-wrap gap-1 pt-1'>
							{task.tags.map((tag, idx) => (
								<span
									key={`${task.id}-tag-${idx}-${tag}`}
									className='rounded bg-gray-800 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-400'
								>
									{tag}
								</span>
							))}
						</div>
					)}
				</div>
			</td>
			<td className={clsx(cellPadding, 'align-top text-sm text-gray-300')}>
				{task.responsibleName || '—'}
			</td>
			<td className={cellPadding}>
				<StatusBadge status={task.status} label={task.statusName} />
			</td>
			<td
				className={clsx(
					cellPadding,
					'text-sm flex items-center gap-1',
					task.isOverdue ? 'text-red-400 font-semibold' : 'text-gray-300'
				)}
			>
				{task.isOverdue && <AlertCircle className='h-3 w-3 animate-pulse' />}
				{deadline}
			</td>
			<td className={clsx(cellPadding, 'text-center text-sm text-gray-200')}>
				<InlineNumberInput
					value={task.metadata.weight ?? ''}
					onChange={value => {
						onUpdate?.(task.id, {
							metadata: {
								...task.metadata,
								weight: value !== '' ? Number(value) : null,
							},
						})
					}}
					placeholder='—'
					disabled={!isAdminMode}
				/>
			</td>
			<td className={clsx(cellPadding, 'text-sm text-gray-300')}>
				<InlineSelect
					value={task.metadata.impact ?? ''}
					options={['Сильное', 'Умеренное', 'Слабое']}
					onChange={value => {
						onUpdate?.(task.id, {
							metadata: {
								...task.metadata,
								impact: value || null,
							},
						})
					}}
					className={getImpactClass(task.metadata.impact)}
					placeholder='—'
					disabled={!isAdminMode}
				/>
			</td>
			<td className={clsx(cellPadding, 'text-sm text-gray-300')}>
				<InlineSelect
					value={task.metadata.system ?? ''}
					options={availableSystems}
					onChange={value => {
						onUpdate?.(task.id, {
							metadata: {
								...task.metadata,
								system: value || null,
							},
						})
					}}
					placeholder='—'
					allowCustom={true}
				/>
			</td>
			<td className={clsx(cellPadding, 'text-sm text-gray-300')}>
				<InlineSelect
					value={task.metadata.p ?? ''}
					options={PRIORITY_LEVELS as unknown as string[]}
					onChange={value => {
						onUpdate?.(task.id, {
							metadata: {
								...task.metadata,
								p: value || null,
							},
						})
					}}
					className={getPriorityClass(task.metadata.p)}
					placeholder='—'
					disabled={!isAdminMode}
				/>
			</td>
			<td className={clsx(cellPadding, 'text-right')}>
				<div className='flex justify-end gap-2'>
					{isAdminMode && (
						<>
							<button
								type='button'
								onClick={() => onComplete(task)}
								className='group rounded-lg border border-green-600/50 px-2 py-2 text-xs font-semibold text-green-400 transition-all duration-200 hover:bg-green-600/20 hover:border-green-500 hover:shadow-lg hover:shadow-green-500/20 active:scale-95'
								title='Отметить завершённой'
							>
								<Check className='h-4 w-4 transition-transform group-hover:scale-110' />
							</button>
							<button
								type='button'
								onClick={() => onEdit(task)}
								className='group rounded-lg border border-blue-600/50 px-2 py-2 text-xs font-semibold text-blue-400 transition-all duration-200 hover:bg-blue-600/20 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95'
								title='Редактировать'
							>
								<Edit className='h-4 w-4 transition-transform group-hover:scale-110' />
							</button>
							<button
								type='button'
								onClick={onExclude}
								className='group rounded-lg border border-gray-500/50 px-2 py-2 text-xs font-semibold text-gray-400 transition-all duration-200 hover:bg-gray-600/20 hover:border-gray-500 hover:shadow-lg hover:shadow-gray-500/20 active:scale-95'
								title='Исключить из списка'
							>
								<EyeOff className='h-4 w-4 transition-transform group-hover:scale-110' />
							</button>
						</>
					)}
				</div>
			</td>
		</tr>
	)
}

// Inline компоненты для редактирования
function InlineSelect({
	value,
	options,
	onChange,
	className,
	placeholder,
	disabled,
	allowCustom = false,
}: {
	value: string
	options: string[]
	onChange: (value: string) => void
	className?: string
	placeholder?: string
	disabled?: boolean
	allowCustom?: boolean
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const selectRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isOpen) {
			setSearchTerm('')
			// Фокус на инпут поиска при открытии
			setTimeout(() => inputRef.current?.focus(), 50)
		}
	}, [isOpen])

	const filteredOptions = options.filter(option =>
		option.toLowerCase().includes(searchTerm.toLowerCase())
	)

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				selectRef.current &&
				!selectRef.current.contains(event.target as Node)
			) {
				setIsOpen(false)
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen])

	return (
		<div ref={selectRef} className='relative w-full'>
			<button
				type='button'
				onClick={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
				className={clsx(
					'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-bold transition w-full min-w-[3rem] border',
					className || 'bg-gray-800 text-gray-400 border-gray-700',
					isOpen && 'ring-2 ring-blue-500',
					disabled && 'opacity-70 cursor-default'
				)}
			>
				{value || placeholder || '—'}
			</button>
			{isOpen && (
				<div className='absolute z-50 mt-1 w-full min-w-[12rem] rounded-md bg-gray-800 border border-gray-700 shadow-lg overflow-hidden'>
					{(allowCustom || options.length > 5) && (
						<div className='p-2 border-b border-gray-700 bg-gray-800'>
							<input
								ref={inputRef}
								type='text'
								value={searchTerm}
								onChange={e => setSearchTerm(e.target.value)}
								className='w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none'
								placeholder='Поиск...'
								onClick={e => e.stopPropagation()}
							/>
						</div>
					)}
					<div className='max-h-60 overflow-y-auto py-1'>
						<button
							type='button'
							onClick={() => {
								onChange('')
								setIsOpen(false)
							}}
							className='w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700'
						>
							{placeholder || '—'}
						</button>
						{filteredOptions.map(option => (
							<button
								key={option}
								type='button'
								onClick={() => {
									onChange(option)
									setIsOpen(false)
								}}
								className={clsx(
									'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700',
									value === option
										? 'text-white font-semibold'
										: 'text-gray-300'
								)}
							>
								{option}
							</button>
						))}
						{allowCustom &&
							searchTerm &&
							!filteredOptions.some(
								opt => opt.toLowerCase() === searchTerm.toLowerCase()
							) && (
								<button
									type='button'
									onClick={() => {
										onChange(searchTerm)
										setIsOpen(false)
									}}
									className='w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-gray-700 font-medium border-t border-gray-700 mt-1'
								>
									+ Добавить «{searchTerm}»
								</button>
							)}
						{filteredOptions.length === 0 && !searchTerm && (
							<div className='px-3 py-1.5 text-xs text-gray-500'>Нет опций</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

function InlineTextInput({
	value,
	onChange,
	placeholder,
	disabled,
}: {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	disabled?: boolean
}) {
	const [isEditing, setIsEditing] = useState(false)
	const [tempValue, setTempValue] = useState(value)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [isEditing])

	useEffect(() => {
		setTempValue(value)
	}, [value])

	const handleBlur = () => {
		onChange(tempValue)
		setIsEditing(false)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			onChange(tempValue)
			setIsEditing(false)
		} else if (e.key === 'Escape') {
			setTempValue(value)
			setIsEditing(false)
		}
	}

	if (isEditing) {
		return (
			<input
				ref={inputRef}
				type='text'
				value={tempValue}
				onChange={e => setTempValue(e.target.value)}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				className='w-full px-2 py-1 text-xs bg-gray-800 text-white border border-blue-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
			/>
		)
	}

	return (
		<button
			type='button'
			onClick={() => !disabled && setIsEditing(true)}
			disabled={disabled}
			className={clsx(
				'w-full text-left px-2 py-1 text-xs text-gray-300 rounded-md transition border border-transparent',
				!disabled && 'hover:bg-gray-800 hover:border-gray-700',
				disabled && 'cursor-default'
			)}
		>
			{value || placeholder || '—'}
		</button>
	)
}

function InlineNumberInput({
	value,
	onChange,
	placeholder,
	disabled,
}: {
	value: number | string
	onChange: (value: string) => void
	placeholder?: string
	disabled?: boolean
}) {
	const [isEditing, setIsEditing] = useState(false)
	const [tempValue, setTempValue] = useState(String(value || ''))
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [isEditing])

	useEffect(() => {
		setTempValue(String(value || ''))
	}, [value])

	const handleBlur = () => {
		onChange(tempValue)
		setIsEditing(false)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			onChange(tempValue)
			setIsEditing(false)
		} else if (e.key === 'Escape') {
			setTempValue(String(value || ''))
			setIsEditing(false)
		}
	}

	if (isEditing) {
		return (
			<input
				ref={inputRef}
				type='number'
				value={tempValue}
				onChange={e => setTempValue(e.target.value)}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				className='w-16 px-2 py-1 text-xs bg-gray-800 text-white border border-blue-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center'
			/>
		)
	}

	return (
		<button
			type='button'
			onClick={() => !disabled && setIsEditing(true)}
			disabled={disabled}
			className={clsx(
				'w-full text-center px-2 py-1 text-xs text-gray-200 rounded-md transition border border-transparent',
				!disabled && 'hover:bg-gray-800 hover:border-gray-700',
				disabled && 'cursor-default'
			)}
		>
			{value || placeholder || '—'}
		</button>
	)
}

function StatusBadge({ status, label }: { status: string; label: string }) {
	const styles: Record<string, string> = {
		'1': 'bg-gray-800 text-gray-300 border border-gray-700',
		'2': 'bg-yellow-900/40 text-yellow-200 border border-yellow-700/60',
		'3': 'bg-blue-900/40 text-blue-200 border border-blue-700/60',
		'4': 'bg-indigo-900/40 text-indigo-200 border border-indigo-700/60',
		'5': 'bg-green-900/40 text-green-200 border border-green-700/60',
		'6': 'bg-gray-900/60 text-gray-400 border border-gray-700/60',
		'7': 'bg-red-900/40 text-red-200 border border-red-700/60',
	}

	return (
		<span
			className={clsx(
				'inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
				styles[status] ?? styles['1']
			)}
		>
			{label}
		</span>
	)
}

function getAbcClass(value: string | null | undefined) {
	switch (value?.toUpperCase()) {
		case 'A':
			return 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40'
		case 'B':
			return 'bg-amber-500/10 text-amber-200 border border-amber-500/40'
		case 'C':
			return 'bg-sky-500/10 text-sky-200 border border-sky-500/40'
		default:
			return 'bg-gray-800 text-gray-400 border border-gray-700'
	}
}

function getImpactClass(value: string | null | undefined) {
	switch (value) {
		case 'Сильное':
			return 'bg-red-500/10 text-red-200 border border-red-500/40'
		case 'Умеренное':
			return 'bg-orange-500/10 text-orange-200 border border-orange-500/40'
		case 'Слабое':
			return 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/40'
		default:
			return 'bg-gray-800 text-gray-400 border border-gray-700'
	}
}

function getRowColorClass(task: TaskListItem): string | null {
	// Приоритет по статусу
	if (task.status === '5') {
		// Готово - зелёный оттенок
		return 'bg-green-900/20'
	}
	if (task.status === '7') {
		// Отклонена - красный оттенок
		return 'bg-red-900/20'
	}
	if (task.isOverdue) {
		// Просрочена - красный оттенок
		return 'bg-red-900/30'
	}
	if (task.status === '3') {
		// Выполняется - синий оттенок
		return 'bg-blue-900/20'
	}
	if (task.status === '2') {
		// Ждёт выполнения - жёлтый оттенок
		return 'bg-yellow-900/20'
	}

	// Приоритет по влиянию
	if (task.metadata.impact === 'Сильное') {
		return 'bg-red-900/15'
	}
	if (task.metadata.impact === 'Умеренное') {
		return 'bg-orange-900/15'
	}
	if (task.metadata.impact === 'Слабое') {
		return 'bg-yellow-900/15'
	}

	// Приоритет по ABC
	if (task.metadata.abc?.toUpperCase() === 'A') {
		return 'bg-emerald-900/15'
	}
	if (task.metadata.abc?.toUpperCase() === 'B') {
		return 'bg-amber-900/10'
	}
	if (task.metadata.abc?.toUpperCase() === 'C') {
		return 'bg-sky-900/10'
	}

	return null
}
