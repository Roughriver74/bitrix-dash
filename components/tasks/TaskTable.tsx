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
import { TaskListItem } from '@/components/tasks/types'

interface TaskTableProps {
	tasks: TaskListItem[]
	loading?: boolean
	onReorder: (tasks: TaskListItem[]) => void
	onEdit: (task: TaskListItem) => void
	onComplete: (task: TaskListItem) => void
	onDelete: (task: TaskListItem) => void
}

export function TaskTable({
	tasks,
	loading,
	onReorder,
	onEdit,
	onComplete,
	onDelete,
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
						<table className='min-w-full table-fixed border-collapse'>
							<thead className='bg-gray-800/70'>
								<tr className='text-left text-sm font-medium text-gray-300'>
									<th className='w-12 px-4 py-3'>#</th>
									<th className='w-12 px-4 py-3'></th>
									<th className='w-24 px-4 py-3'>ABC</th>
									<th className='px-4 py-3'>Задача</th>
									<th className='w-48 px-4 py-3'>Ответственный</th>
									<th className='w-36 px-4 py-3'>Статус</th>
									<th className='w-32 px-4 py-3'>Дедлайн</th>
									<th className='w-28 px-4 py-3'>Вес</th>
									<th className='w-44 px-4 py-3'>Влияние</th>
									<th className='w-40 px-4 py-3'>Система</th>
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
}

function SortableRow({ task, onEdit, onComplete, onDelete }: SortableRowProps) {
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

	return (
		<tr
			ref={setNodeRef}
			style={style}
			className={clsx(
				'border-t border-gray-800 transition',
				isDragging ? 'bg-blue-900/40 shadow-lg' : 'hover:bg-gray-800/40'
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
				<span
					className={clsx(
						'inline-flex items-center rounded-md px-2 py-1 text-xs font-bold transition',
						getAbcClass(task.metadata.abc)
					)}
				>
					{task.metadata.abc ?? '—'}
				</span>
			</td>
			<td className='px-4 py-3 align-top'>
				<div className='space-y-1'>
					<div className='font-semibold text-white'>{task.title}</div>
					{task.description && (
						<p className='text-xs text-gray-400 line-clamp-2'>
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
				{task.metadata.weight ?? '—'}
			</td>
			<td className='px-4 py-3 text-sm text-gray-300'>
				{task.metadata.impact ?? '—'}
			</td>
			<td className='px-4 py-3 text-sm text-gray-300'>
				{task.metadata.system ?? '—'}
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
