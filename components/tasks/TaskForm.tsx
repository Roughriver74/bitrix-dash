'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TaskMetadata } from '@/lib/tasks/metadata';
import { TaskFormMode, TaskListItem, UserOption } from '@/components/tasks/types';
import { X } from 'lucide-react';

export interface TaskFormValues {
  title: string;
  description: string;
  responsibleId: string;
  deadline: string | null;
  metadata: TaskMetadata;
  otherTags: string[];
  status?: string;
}

interface TaskFormProps {
  open: boolean;
  mode: TaskFormMode;
  users: UserOption[];
  task?: TaskListItem | null;
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
  onClose: () => void;
  submitting?: boolean;
}

const ABC_OPTIONS = ['A', 'B', 'C'];
const STATUS_OPTIONS = [
  { value: '1', label: 'Новая' },
  { value: '2', label: 'Ждёт выполнения' },
  { value: '3', label: 'Выполняется' },
  { value: '4', label: 'Ждёт контроля' },
  { value: '5', label: 'Готово' },
  { value: '6', label: 'Отложена' },
  { value: '7', label: 'Отклонена' },
];

export function TaskForm({
  open,
  mode,
  users,
  task,
  onSubmit,
  onClose,
  submitting,
}: TaskFormProps) {
  const initialMetadata: TaskMetadata = {
    manualPriority: task?.metadata.manualPriority ?? null,
    abc: task?.metadata.abc ?? null,
    impact: task?.metadata.impact ?? null,
    system: task?.metadata.system ?? null,
    weight: task?.metadata.weight ?? null,
  };

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [responsibleId, setResponsibleId] = useState(
    task?.responsibleId ?? (users[0]?.id ?? ''),
  );
  const [deadline, setDeadline] = useState<string | null>(
    task?.deadline ? toDateTimeLocal(task.deadline) : null,
  );
  const [metadata, setMetadata] = useState<TaskMetadata>(initialMetadata);
  const [otherTags, setOtherTags] = useState<string>(
    (task?.otherTags ?? []).join(', '),
  );
  const [status, setStatus] = useState<string | undefined>(task?.status);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setResponsibleId(task?.responsibleId ?? (users[0]?.id ?? ''));
      setDeadline(task?.deadline ? toDateTimeLocal(task.deadline) : null);
      setMetadata({
        manualPriority: task?.metadata.manualPriority ?? null,
        abc: task?.metadata.abc ?? null,
        impact: task?.metadata.impact ?? null,
        system: task?.metadata.system ?? null,
        weight: task?.metadata.weight ?? null,
      });
      setOtherTags((task?.otherTags ?? []).join(', '));
      setStatus(task?.status);
      setError(null);
    }
  }, [open, task, users]);

  const heading = mode === 'create' ? 'Новая задача' : 'Редактирование задачи';
  const submitLabel = mode === 'create' ? 'Создать' : 'Сохранить';

  const availableUsers = useMemo(
    () => users.filter((user) => user.active),
    [users],
  );

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim()) {
      setError('Укажите заголовок задачи');
      return;
    }

    if (!responsibleId) {
      setError('Выберите ответственного');
      return;
    }

    const payload: TaskFormValues = {
      title: title.trim(),
      description: description.trim(),
      responsibleId,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      metadata: {
        ...metadata,
        abc: metadata.abc ? metadata.abc.toUpperCase() : null,
      },
      otherTags: parseTagsInput(otherTags),
      status: mode === 'edit' ? status : undefined,
    };

    await onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="relative w-full max-w-3xl rounded-xl bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">{heading}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] overflow-y-auto px-6 py-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Заголовок
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Например, Настроить новый отчёт"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Ответственный
                </label>
                <select
                  value={responsibleId}
                  onChange={(event) => setResponsibleId(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                >
                  <option value="">— Выберите сотрудника —</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Дедлайн
                </label>
                <input
                  type="datetime-local"
                  value={deadline ?? ''}
                  onChange={(event) => setDeadline(event.target.value || null)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  При необходимости можно оставить пустым
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Теги (через запятую)
                </label>
                <input
                  type="text"
                  value={otherTags}
                  onChange={(event) => setOtherTags(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Например, CRM, VIP"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Описание
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="h-32 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Расскажите о задаче, ссылках, ограничениях..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    ABC
                  </label>
                  <select
                    value={metadata.abc ?? ''}
                    onChange={(event) =>
                      setMetadata((current) => ({
                        ...current,
                        abc: event.target.value || null,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">—</option>
                    {ABC_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Вес
                  </label>
                  <input
                    type="number"
                    value={metadata.weight ?? ''}
                    min={0}
                    onChange={(event) =>
                      setMetadata((current) => ({
                        ...current,
                        weight:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Влияние на прибыль
                </label>
                <input
                  type="text"
                  value={metadata.impact ?? ''}
                  onChange={(event) =>
                    setMetadata((current) => ({
                      ...current,
                      impact: event.target.value || null,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Например, Высокое / Среднее"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Система / продукт
                </label>
                <input
                  type="text"
                  value={metadata.system ?? ''}
                  onChange={(event) =>
                    setMetadata((current) => ({
                      ...current,
                      system: event.target.value || null,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Например, Bitrix24, CRM, 1C"
                />
              </div>

              {mode === 'edit' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Статус
                  </label>
                  <select
                    value={status ?? ''}
                    onChange={(event) => setStatus(event.target.value || undefined)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— Без изменений —</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-800 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
              disabled={submitting}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/60"
            >
              {submitting ? 'Сохранение...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (input: number) => `${input}`.padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseTagsInput(value: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

