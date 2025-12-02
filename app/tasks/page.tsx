'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Lock, Unlock } from 'lucide-react'
import { TaskForm, TaskFormValues } from '@/components/tasks/TaskForm'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
	TaskFormMode,
	TaskListItem,
	UserOption,
} from '@/components/tasks/types'

interface TasksResponse {
	tasks: TaskListItem[]
	users: UserOption[]
	department: {
		id: string
		name: string
	}
}

export default function TasksPage() {
	return (
		<ErrorBoundary>
			<TasksPageContent />
		</ErrorBoundary>
	)
}

function TasksPageContent() {
	const [tasks, setTasks] = useState<TaskListItem[]>([])
	const [users, setUsers] = useState<UserOption[]>([])
	const [departmentName, setDepartmentName] = useState<string>('')
	const [loading, setLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [formOpen, setFormOpen] = useState(false)
	const [formMode, setFormMode] = useState<TaskFormMode>('create')
	const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null)
	const [submitting, setSubmitting] = useState<boolean>(false)
	const [isAdminMode, setIsAdminMode] = useState<boolean>(false)

	const fetchTasks = useCallback(async (forceSync = false) => {
		try {
			setLoading(true)
			setError(null)
			const url = forceSync ? '/api/tasks?forceSync=true' : '/api/tasks'
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(await extractError(response))
			}

			const data: TasksResponse = await response.json()
			setTasks(sortByOrder(data.tasks))
			setUsers(data.users)
			setDepartmentName(data.department?.name ?? '')
			
		} catch (err) {
			console.error(err)
			setError(
				err instanceof Error ? err.message : 'Не удалось загрузить задачи'
			)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchTasks()
	}, [fetchTasks])

	const handleSync = () => {
		fetchTasks(true)
	}

	const activeTasks = useMemo(() => sortByOrder(tasks), [tasks])

	const handleAdminToggle = () => {
		if (isAdminMode) {
			setIsAdminMode(false)
		} else {
			const password = window.prompt('Введите пароль администратора:')
			if (password === 'admin') {
				setIsAdminMode(true)
			} else if (password !== null) {
				alert('Неверный пароль')
			}
		}
	}

	const handleOpenCreate = () => {
		setFormMode('create')
		setSelectedTask(null)
		setFormOpen(true)
	}

	const handleEdit = (task: TaskListItem) => {
		setFormMode('edit')
		setSelectedTask(task)
		setFormOpen(true)
	}

	const handleCloseForm = () => {
		setFormOpen(false)
		setSelectedTask(null)
		setSubmitting(false)
	}

	const handleFormSubmit = async (values: TaskFormValues) => {
		try {
			setSubmitting(true)

			if (formMode === 'create') {
				const response = await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: values.title,
						responsibleId: values.responsibleId,
						description: values.description,
						deadline: values.deadline,
						metadata: values.metadata,
						tags: values.otherTags,
					}),
				})

				if (!response.ok) {
					throw new Error(await extractError(response))
				}

				const data = await response.json()
				setUsers(data.users ?? users)
				if (data.task) {
					setTasks(prev => sortByOrder([...prev, data.task]))
				}
			} else if (selectedTask) {
				const response = await fetch('/api/tasks', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: selectedTask.id,
						fields: {
							title: values.title,
							description: values.description,
							responsibleId: values.responsibleId,
							deadline: values.deadline,
							status: values.status,
						},
						metadata: values.metadata,
						otherTags: values.otherTags,
					}),
				})

				if (!response.ok) {
					throw new Error(await extractError(response))
				}

				const data = await response.json()
				if (data.task) {
					setTasks(prev =>
						sortByOrder(
							prev.map(task => (task.id === data.task.id ? data.task : task))
						)
					)
				}
			}

			handleCloseForm()
		} catch (err) {
			console.error(err)
			setError(
				err instanceof Error ? err.message : 'Не удалось сохранить задачу'
			)
		} finally {
			setSubmitting(false)
		}
	}

	const handleDelete = async (task: TaskListItem) => {
		const confirmed = window.confirm(
			`Удалить задачу «${task.title}»? Это действие нельзя отменить.`
		)
		if (!confirmed) return

		const previous = tasks.map(item => ({ ...item }))
		setTasks(prev => prev.filter(item => item.id !== task.id))

		try {
			const response = await fetch(`/api/tasks?id=${task.id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				throw new Error(await extractError(response))
			}
		} catch (err) {
			console.error(err)
			setError(err instanceof Error ? err.message : 'Не удалось удалить задачу')
			setTasks(previous)
		}
	}

	const handleComplete = async (task: TaskListItem) => {
		const previous = tasks.map(item => ({ ...item }))

		try {
			const response = await fetch('/api/tasks', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: task.id,
					fields: { status: '5' },
					otherTags: task.otherTags,
					metadata: {
						...task.metadata,
					},
				}),
			})

			if (!response.ok) {
				throw new Error(await extractError(response))
			}

			setTasks(prev => prev.filter(item => item.id !== task.id))
		} catch (err) {
			console.error(err)
			setError(
				err instanceof Error ? err.message : 'Не удалось завершить задачу'
			)
			setTasks(previous)
		}
	}

	const handleReorder = async (nextOrder: TaskListItem[]) => {
		const previous = tasks.map(item => ({ ...item }))

		// Оптимистично обновляем UI
		setTasks(nextOrder)

		try {
			const response = await fetch('/api/tasks', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'reorder',
					tasks: nextOrder.map(task => ({
						id: task.id,
						order: task.order,
						otherTags: task.otherTags,
						metadata: task.metadata,
					})),
				}),
			})

			if (!response.ok) {
				throw new Error(await extractError(response))
			}

			// После успешного сохранения обновляем задачи с сервера
			// чтобы получить актуальные order и metadata
			await fetchTasks()
		} catch (err) {
			console.error(err)
			setError(
				err instanceof Error ? err.message : 'Не удалось изменить порядок задач'
			)
			// Откатываем изменения в случае ошибки
			setTasks(previous)
		}
	}

	const activeCount = activeTasks.length

	return (
		<main className='min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 pb-16'>
			<div className='w-full px-4 py-6 md:px-6 lg:px-8'>
				<header className='mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
					<div className='space-y-2'>
						<h1 className='text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-gray-300'>
							Задачи отдела {departmentName ? `— ${departmentName}` : ''}
						</h1>
						<p className='mt-2 text-sm md:text-base text-gray-400 max-w-2xl'>
							Управляйте приоритетами, тегами и статусами задач прямо из
							дашборда. Количество активных задач: <span className='font-semibold text-blue-400'>{activeCount}</span>
						</p>
					</div>
					<div className='flex flex-wrap gap-3'>
						<button
							type='button'
							onClick={handleAdminToggle}
							className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 ${
								isAdminMode
									? 'border-red-600/40 bg-red-600/10 text-red-200 hover:bg-red-600/20 hover:border-red-500 hover:shadow-lg hover:shadow-red-500/20'
									: 'border-gray-600/40 bg-gray-600/10 text-gray-200 hover:bg-gray-600/20 hover:border-gray-500'
							}`}
						>
							{isAdminMode ? (
								<>
									<Unlock className='h-4 w-4' />
									Админ: ВКЛ
								</>
							) : (
								<>
									<Lock className='h-4 w-4' />
									Админ: ВЫКЛ
								</>
							)}
						</button>
						<button
							type='button'
							onClick={() => fetchTasks(false)}
							className='inline-flex items-center gap-2 rounded-lg border border-blue-600/40 bg-blue-600/10 px-4 py-2 text-sm font-semibold text-blue-200 transition-all duration-200 hover:bg-blue-600/20 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95'
							disabled={loading}
						>
							<RefreshCw
								className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
							/>
							Обновить
						</button>
						{isAdminMode && (
							<button
								type='button'
								onClick={handleOpenCreate}
								className='inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:from-green-500 hover:to-emerald-500 hover:shadow-lg hover:shadow-green-500/30 active:scale-95'
							>
								<Plus className='h-4 w-4' />
								Новая задача
							</button>
						)}
					</div>
				</header>

				{error && (
					<div className='mb-6 rounded-lg border border-red-500/50 bg-gradient-to-r from-red-500/10 to-red-600/10 px-4 py-3 text-sm text-red-200 shadow-lg shadow-red-500/10 backdrop-blur-sm animate-pulse'>
						{error}
					</div>
				)}

				<TaskTable
					tasks={activeTasks}
					loading={loading}
					isAdminMode={isAdminMode}
					onReorder={handleReorder}
					onEdit={handleEdit}
					onComplete={handleComplete}
					onDelete={handleDelete}
					onUpdate={async (taskId, updates) => {
						try {
							const response = await fetch('/api/tasks', {
								method: 'PATCH',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									id: taskId,
									fields: updates.fields,
									metadata: updates.metadata,
									otherTags: updates.otherTags,
								}),
							})

							if (!response.ok) {
								throw new Error(await extractError(response))
							}

							const data = await response.json()
							if (data.task) {
								setTasks(prev =>
									sortByOrder(
										prev.map(task => (task.id === data.task.id ? data.task : task))
									)
								)
							}
						} catch (err) {
							console.error(err)
							setError(
								err instanceof Error ? err.message : 'Не удалось обновить задачу'
							)
						}
					}}
					onSync={handleSync}
				/>
			</div>

			<TaskForm
				open={formOpen}
				mode={formMode}
				users={users}
				task={selectedTask}
				onSubmit={handleFormSubmit}
				onClose={handleCloseForm}
				submitting={submitting}
			/>
		</main>
	)
}

async function extractError(response: Response) {
	try {
		const text = await response.text()
		if (!text) return response.statusText
		const data = JSON.parse(text)
		if (typeof data === 'string') return data
		if (data?.error) return data.error
		return response.statusText
	} catch (error) {
		return response.statusText
	}
}

function sortByOrder(items: TaskListItem[]) {
	return [...items].sort((a, b) => a.order - b.order)
}
