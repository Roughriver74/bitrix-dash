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
import { GripVertical, Check, Edit, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useState, useRef, useEffect } from 'react'
import { TaskListItem } from '@/components/tasks/types'

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

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) {
			return
		}

		const oldIndex = tasks.findIndex(task => task.id === active.id)
		const newIndex = tasks.findIndex(task => task.id === over.id)
		if (oldIndex === -1 || newIndex === -1) {
			return
		}

		const reordered = arrayMove(tasks, oldIndex, newIndex).map(
			(task, index) => ({
				...task,
				order: index + 1,
				metadata: {
					...task.metadata,
					manualPriority: index + 1,
				},
			})
		)

		onReorder(reordered)
	}

	return (
		<div className='overflow-hidden rounded-xl border border-gray-800 bg-gray-900'>
			<div className='overflow-x-auto'>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={tasks.map(task => task.id)}
						strategy={verticalListSortingStrategy}
					>
						<table className='w-full border-collapse table-auto'>
							<thead className='bg-gray-800/70 sticky top-0 z-10'>
								<tr className='text-left text-sm font-medium text-gray-300'>
									<th className='w-12 px-4 py-3'>#</th>
									<th className='w-12 px-4 py-3'></th>
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
							</thead>
							<tbody className='text-sm text-gray-200'>
								{tasks.length === 0 && (
									<tr>
										<td
											colSpan={11}
											className='px-6 py-12 text-center text-gray-400'
										>
											{loading
												? 'Загрузка задач...'
												: 'Задачи не найдены. Добавьте первую задачу.'}
										</td>
									</tr>
								)}

								{tasks.map(task => (
									<SortableRow
										key={task.id}
										task={task}
										onEdit={onEdit}
										onComplete={onComplete}
										onDelete={onDelete}
										onUpdate={onUpdate}
									/>
								))}
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
							{task.tags.map(tag => (
								<span
									key={tag}
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
