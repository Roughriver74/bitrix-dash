import type { TaskMetadata } from '@/lib/tasks/metadata';

export interface TaskListItem {
  id: string;
  title: string;
  description: string;
  responsibleId: string;
  responsibleName: string;
  status: string;
  statusName: string;
  deadline: string | null;
  inactiveDays: number | null;
  priorityLevel: 'normal' | 'warning' | 'critical';
  isOverdue: boolean;
  metadata: TaskMetadata;
  tags: string[];
  otherTags: string[];
  order: number;
  raw: {
    createdDate?: string;
    changedDate?: string;
    closedDate?: string;
  };
}

export interface UserOption {
  id: string;
  name: string;
  email?: string;
  position?: string;
  active: boolean;
}

export type TaskFormMode = 'create' | 'edit';

