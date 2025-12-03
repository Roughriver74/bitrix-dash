'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Lock, Unlock } from 'lucide-react'
import { TaskForm, TaskFormValues } from '@/components/tasks/TaskForm'
import { TaskTable } from '@/components/tasks/TaskTable'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { buildMetadataTags } from '@/lib/tasks/metadata'
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
	systems?: string[]
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
	const [systems, setSystems] = useState<string[]>([])
	const [loading, setLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [formOpen, setFormOpen] = useState(false)
	const [formMode, setFormMode] = useState<TaskFormMode>('create')
	const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null)
	const [submitting, setSubmitting] = useState<boolean>(false)
	const [isAdminMode, setIsAdminMode] = useState<boolean>(false)
	const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
	const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
	const [isUpdatingTask, setIsUpdatingTask] = useState<boolean>(false)
	const [lastSync, setLastSync] = useState<Date | null>(null)

	const fetchTasks = useCallback(async (forceSync = false, silent = false) => {
		try {
			if (!silent) {
				setLoading(true)
			}
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
			if (data.systems) {
				setSystems(data.systems)
			}
			setLastUpdate(new Date())
			
		} catch (err) {
			console.error(err)
			if (!silent) {
				setError(
					err instanceof Error ? err.message : 'Не удалось загрузить задачи'
				)
			}
		} finally {
			if (!silent) {
				setLoading(false)
			}
		}
	}, [])

	// Первоначальная загрузка
	useEffect(() => {
		fetchTasks()
	}, [fetchTasks])

	// Быстрое автообновление каждые 60 секунд (только чтение из БД, без синхронизации с Bitrix)
	useEffect(() => {
		if (!autoRefresh || isUpdatingTask) return

		const interval = setInterval(() => {
			// Пропускаем обновление, если идет обновление задачи
			if (!isUpdatingTask) {
				// Обновляем без синхронизации (тихо, без показа загрузки)
				// Это только чтение из БД, не запрос к Bitrix API
				fetchTasks(false, true)
			}
		}, 60000) // 60 секунд - оптимальный баланс между актуальностью и нагрузкой

		return () => clearInterval(interval)
	}, [autoRefresh, fetchTasks, isUpdatingTask])

	// Полная синхронизация с Bitrix раз в час (3600000 мс)
	useEffect(() => {
		if (!autoRefresh) return

		// Выполняем синхронизацию сразу при включении автообновления (если прошло больше часа с последней)
		const shouldSyncNow = !lastSync || (Date.now() - lastSync.getTime()) > 3600000
		
		if (shouldSyncNow) {
			console.log('🔄 Автоматическая полная синхронизация с Bitrix...')
			fetchTasks(true, true) // forceSync=true, silent=true
			setLastSync(new Date())
		}

		// Устанавливаем интервал для синхронизации раз в час
		const syncInterval = setInterval(() => {
			console.log('🔄 Автоматическая полная синхронизация с Bitrix (раз в час)...')
			fetchTasks(true, true) // forceSync=true, silent=true
			setLastSync(new Date())
		}, 3600000) // 1 час = 3600000 миллисекунд

		return () => clearInterval(syncInterval)
	}, [autoRefresh, fetchTasks, lastSync])

	const handleSync = () => {
		fetchTasks(true, false)
		setLastSync(new Date())
	}

	const handleRefresh = () => {
		fetchTasks(false, false)
	}

	const toggleAutoRefresh = () => {
		setAutoRefresh(prev => !prev)
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

			// Удаляем задачу из списка (она завершена)
			setTasks(prev => prev.filter(item => item.id !== task.id))
			
			// Если автообновление включено, через несколько секунд обновим список
			// чтобы убедиться, что все изменения синхронизированы
			if (autoRefresh) {
				setTimeout(() => {
					fetchTasks(false, true)
				}, 2000)
			}
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
							{lastUpdate && (
								<span className='ml-2 text-xs text-gray-500'>
									(обновлено: {lastUpdate.toLocaleTimeString('ru-RU')})
								</span>
							)}
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
							onClick={toggleAutoRefresh}
							className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 ${
								autoRefresh
									? 'border-green-600/40 bg-green-600/10 text-green-200 hover:bg-green-600/20 hover:border-green-500 hover:shadow-lg hover:shadow-green-500/20'
									: 'border-gray-600/40 bg-gray-600/10 text-gray-200 hover:bg-gray-600/20 hover:border-gray-500'
							}`}
							title={autoRefresh ? 'Автообновление включено (БД: каждые 60 сек, Bitrix: раз в час)' : 'Автообновление выключено'}
						>
							<RefreshCw
								className={autoRefresh ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
							/>
							{autoRefresh ? 'Авто: ВКЛ' : 'Авто: ВЫКЛ'}
						</button>
						<button
							type='button'
							onClick={handleRefresh}
							className='inline-flex items-center gap-2 rounded-lg border border-blue-600/40 bg-blue-600/10 px-4 py-2 text-sm font-semibold text-blue-200 transition-all duration-200 hover:bg-blue-600/20 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95'
							disabled={loading}
							title={lastUpdate ? `Последнее обновление: ${lastUpdate.toLocaleTimeString('ru-RU')}` : 'Обновить список задач'}
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
					systems={systems}
					onReorder={handleReorder}
					onEdit={handleEdit}
					onComplete={handleComplete}
					onDelete={handleDelete}
					onUpdate={async (taskId, updates) => {
						try {
							setIsUpdatingTask(true)
							
							// Оптимистичное обновление - сразу обновляем задачу в списке
							const currentTask = tasks.find(t => t.id === taskId)
							if (currentTask) {
								// Объединяем метаданные
								const mergedMetadata = {
									...currentTask.metadata,
									...updates.metadata,
								}
								
								// Объединяем otherTags: если переданы новые, используем их, иначе оставляем старые
								const mergedOtherTags = updates.otherTags !== undefined 
									? updates.otherTags 
									: currentTask.otherTags
								
								// Объединяем все теги (метаданные + otherTags)
								// Используем buildMetadataTags для метаданных и добавляем otherTags
								const metadataTags = buildMetadataTags(mergedMetadata)
								const allTags = [...metadataTags, ...mergedOtherTags]
								
								const optimisticTask = {
									...currentTask,
									metadata: mergedMetadata,
									otherTags: mergedOtherTags,
									tags: allTags,
								}
								
								// Временно обновляем задачу в списке
								setTasks(prev =>
									sortByOrder(
										prev.map(task => (task.id === taskId ? optimisticTask : task))
									)
								)
							}

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
								// Если задача завершена (статус 5) или отложена (6), удаляем её из списка
								if (data.task.status === '5' || data.task.status === '6') {
									setTasks(prev => prev.filter(task => task.id !== taskId))
								} else {
									// Обновляем задачу с сервера и пересортировываем
									setTasks(prev =>
										sortByOrder(
											prev.map(task => (task.id === data.task.id ? data.task : task))
										)
									)
								}
							}
						} catch (err) {
							console.error(err)
							setError(
								err instanceof Error ? err.message : 'Не удалось обновить задачу'
							)
							// В случае ошибки перезагружаем список задач
							fetchTasks(false, true)
						} finally {
							setIsUpdatingTask(false)
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
