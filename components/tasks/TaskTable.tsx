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
import { GripVertical, Check, Edit, Trash2, X, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react'
import clsx from 'clsx'
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { TaskListItem } from '@/components/tasks/types'

type GroupBy = 'none' | 'abc' | 'status' | 'responsible' | 'impact'

interface TaskTableProps {
	tasks: TaskListItem[]
	loading?: boolean
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
			}
			metadata?: {
				abc?: string | null
				impact?: string | null
				system?: string | null
				weight?: number | null
			}
			otherTags?: string[]
		}
	) => Promise<void>
}

export function TaskTable({
	tasks,
	loading,
	onReorder,
	onEdit,
	onComplete,
	onDelete,
	onUpdate,
}: TaskTableProps) {
	const [filters, setFilters] = useState({
		abc: '',
		status: '',
		impact: '',
		system: '',
		responsibleName: '',
	})
	const [groupBy, setGroupBy] = useState<GroupBy>('none')
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
	const [showStats, setShowStats] = useState(false)

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
			if (filters.abc && task.metadata.abc !== filters.abc) return false
			if (filters.status && task.status !== filters.status) return false
			if (filters.impact && task.metadata.impact !== filters.impact) return false
			if (
				filters.system &&
				!task.metadata.system?.toLowerCase().includes(filters.system.toLowerCase())
			)
				return false
			if (
				filters.responsibleName &&
				!task.responsibleName?.toLowerCase().includes(filters.responsibleName.toLowerCase())
			)
				return false
			return true
		})
	}, [tasks, filters])

	const clearFilters = () => {
		setFilters({
			abc: '',
			status: '',
			impact: '',
			system: '',
			responsibleName: '',
		})
	}

	const hasActiveFilters = Object.values(filters).some(f => f !== '')

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) {
			return
		}

		// Используем filteredTasks для правильного определения индексов
		const oldIndex = filteredTasks.findIndex(task => task.id === active.id)
		const newIndex = filteredTasks.findIndex(task => task.id === over.id)
		if (oldIndex === -1 || newIndex === -1) {
			return
		}

		// Перемещаем в отфильтрованном списке
		const reorderedFiltered = arrayMove(filteredTasks, oldIndex, newIndex)

		// Обновляем порядок только для отфильтрованных задач
		const reordered = reorderedFiltered.map((task, index) => ({
			...task,
			order: index + 1,
			metadata: {
				...task.metadata,
				manualPriority: index + 1,
			},
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
			total: filteredTasks.length,
			byAbc: {
				A: filteredTasks.filter(t => t.metadata.abc === 'A').length,
				B: filteredTasks.filter(t => t.metadata.abc === 'B').length,
				C: filteredTasks.filter(t => t.metadata.abc === 'C').length,
				none: filteredTasks.filter(t => !t.metadata.abc).length,
			},
			byStatus: {
				new: filteredTasks.filter(t => t.status === '1').length,
				waiting: filteredTasks.filter(t => t.status === '2').length,
				inProgress: filteredTasks.filter(t => t.status === '3').length,
				control: filteredTasks.filter(t => t.status === '4').length,
				completed: filteredTasks.filter(t => t.status === '5').length,
				deferred: filteredTasks.filter(t => t.status === '6').length,
				declined: filteredTasks.filter(t => t.status === '7').length,
			},
			byImpact: {
				high: filteredTasks.filter(t => t.metadata.impact === 'Сильное').length,
				medium: filteredTasks.filter(t => t.metadata.impact === 'Умеренное').length,
				low: filteredTasks.filter(t => t.metadata.impact === 'Слабое').length,
			},
			overdue: filteredTasks.filter(t => t.isOverdue).length,
		}
	}, [filteredTasks])

	// Группировка задач
	const groupedTasks = useMemo(() => {
		if (groupBy === 'none') {
			return { 'Все задачи': filteredTasks }
		}

		const groups: Record<string, TaskListItem[]> = {}

		filteredTasks.forEach(task => {
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
			}

			if (!groups[groupKey]) {
				groups[groupKey] = []
			}
			groups[groupKey].push(task)
		})

		return groups
	}, [filteredTasks, groupBy])

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

	return (
		<div className='overflow-hidden rounded-xl border border-gray-800 bg-gray-900'>
			{/* Панель управления */}
			<div className='bg-gray-800/50 px-4 py-3 border-b border-gray-700'>
				<div className='flex flex-wrap items-center gap-3'>
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
						</select>
					</div>

					{/* Быстрые фильтры */}
					<div className='flex items-center gap-2 ml-4'>
						<span className='text-xs text-gray-400'>Быстро:</span>
						<button
							onClick={() => applyQuickFilter('urgent')}
							className={clsx(
								'px-3 py-1.5 text-xs rounded-md transition border',
								filters.status === '3'
									? 'bg-blue-600 text-white border-blue-500'
									: 'bg-gray-900 text-gray-300 border-gray-700 hover:border-blue-500'
							)}
						>
							В работе
						</button>
						<button
							onClick={() => applyQuickFilter('highPriority')}
							className={clsx(
								'px-3 py-1.5 text-xs rounded-md transition border',
								filters.abc === 'A'
									? 'bg-emerald-600 text-white border-emerald-500'
									: 'bg-gray-900 text-gray-300 border-gray-700 hover:border-emerald-500'
							)}
						>
							Приоритет A
						</button>
						{stats.overdue > 0 && (
							<button
								className='px-3 py-1.5 text-xs rounded-md transition border bg-red-900/40 text-red-200 border-red-700/60 hover:bg-red-900/60'
							>
								Просрочено: {stats.overdue}
							</button>
						)}
					</div>

					{/* Статистика */}
					<button
						onClick={() => setShowStats(!showStats)}
						className='ml-auto px-3 py-1.5 text-xs rounded-md transition border bg-gray-900 text-gray-300 border-gray-700 hover:border-blue-500 flex items-center gap-1.5'
					>
						<BarChart3 className='h-3.5 w-3.5' />
						Статистика
					</button>
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
			<div className='overflow-x-auto'>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={filteredTasks.map(task => task.id)}
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
									<th className='w-36 px-4 py-3'>Система</th>
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
								) : groupBy === 'none' ? (
									filteredTasks.map(task => (
										<SortableRow
											key={task.id}
											task={task}
											onEdit={onEdit}
											onComplete={onComplete}
											onDelete={onDelete}
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
													groupTasks.map(task => (
														<SortableRow
															key={task.id}
															task={task}
															onEdit={onEdit}
															onComplete={onComplete}
															onDelete={onDelete}
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
	onUpdate,
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

	return (
		<tr
			ref={setNodeRef}
			style={style}
			className={clsx(
				'border-t border-gray-800 transition-colors',
				isDragging
					? 'bg-blue-900/40 shadow-lg'
					: rowColorClass || 'hover:bg-gray-800/40'
			)}
		>
			<td className='px-4 py-3 text-sm font-semibold text-gray-400'>
				{task.order}
			</td>
			<td className='px-4 py-3 text-gray-500'>
				<button
					type='button'
					className='cursor-grab rounded p-2 transition hover:bg-gray-800 hover:text-white active:cursor-grabbing'
					{...attributes}
					{...listeners}
				>
					<GripVertical className='h-4 w-4' />
				</button>
			</td>
			<td className='px-4 py-3'>
				<a
					href={`https://crmwest.ru/company/personal/user/156/tasks/task/view/${task.id}/`}
					target='_blank'
					rel='noopener noreferrer'
					className='text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs'
				>
					{task.id}
				</a>
			</td>
			<td className='px-4 py-3'>
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
				/>
			</td>
			<td className='px-4 py-3 align-top'>
				<div className='space-y-1 max-w-md'>
					<div className='font-semibold text-white break-words'>
						{task.title}
					</div>
					{task.description && (
						<p className='text-xs text-gray-400 line-clamp-3 max-h-[4.5rem] overflow-hidden break-words'>
							{task.description}
						</p>
					)}
					{task.tags.length > 0 && (
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
			<td className='px-4 py-3 align-top text-sm text-gray-300'>
				{task.responsibleName || '—'}
			</td>
			<td className='px-4 py-3'>
				<StatusBadge status={task.status} label={task.statusName} />
			</td>
			<td
				className={clsx(
					'px-4 py-3 text-sm',
					task.isOverdue ? 'text-red-400 font-semibold' : 'text-gray-300'
				)}
			>
				{deadline}
			</td>
			<td className='px-4 py-3 text-center text-sm text-gray-200'>
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
				/>
			</td>
			<td className='px-4 py-3 text-sm text-gray-300'>
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
				/>
			</td>
			<td className='px-4 py-3 text-sm text-gray-300'>
				<InlineTextInput
					value={task.metadata.system ?? ''}
					onChange={value => {
						onUpdate?.(task.id, {
							metadata: {
								...task.metadata,
								system: value || null,
							},
						})
					}}
					placeholder='—'
				/>
			</td>
			<td className='px-4 py-3 text-right'>
				<div className='flex justify-end gap-2'>
					<button
						type='button'
						onClick={() => onComplete(task)}
						className='rounded-lg border border-green-600/50 px-2 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-600/10'
						title='Отметить завершённой'
					>
						<Check className='h-4 w-4' />
					</button>
					<button
						type='button'
						onClick={() => onEdit(task)}
						className='rounded-lg border border-blue-600/50 px-2 py-2 text-xs font-semibold text-blue-400 transition hover:bg-blue-600/10'
						title='Редактировать'
					>
						<Edit className='h-4 w-4' />
					</button>
					<button
						type='button'
						onClick={() => onDelete(task)}
						className='rounded-lg border border-red-500/50 px-2 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-600/10'
						title='Удалить'
					>
						<Trash2 className='h-4 w-4' />
					</button>
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
}: {
	value: string
	options: string[]
	onChange: (value: string) => void
	className?: string
	placeholder?: string
}) {
	const [isOpen, setIsOpen] = useState(false)
	const selectRef = useRef<HTMLDivElement>(null)

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
				onClick={() => setIsOpen(!isOpen)}
				className={clsx(
					'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-bold transition w-full min-w-[3rem] border',
					className || 'bg-gray-800 text-gray-400 border-gray-700',
					isOpen && 'ring-2 ring-blue-500'
				)}
			>
				{value || placeholder || '—'}
			</button>
			{isOpen && (
				<div className='absolute z-50 mt-1 w-full rounded-md bg-gray-800 border border-gray-700 shadow-lg'>
					<div className='py-1'>
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
						{options.map(option => (
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
}: {
	value: string
	onChange: (value: string) => void
	placeholder?: string
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
			onClick={() => setIsEditing(true)}
			className='w-full text-left px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 rounded-md transition border border-transparent hover:border-gray-700'
		>
			{value || placeholder || '—'}
		</button>
	)
}

function InlineNumberInput({
	value,
	onChange,
	placeholder,
}: {
	value: number | string
	onChange: (value: string) => void
	placeholder?: string
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
			onClick={() => setIsEditing(true)}
			className='w-full text-center px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 rounded-md transition border border-transparent hover:border-gray-700'
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
