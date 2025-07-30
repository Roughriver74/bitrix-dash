export interface BitrixConfig {
  webhookUrl: string;
  departmentName: string;
}

export interface BitrixTask {
  ID: string;
  TITLE: string;
  DESCRIPTION?: string;
  RESPONSIBLE_ID: string;
  RESPONSIBLE_NAME?: string;
  CREATED_BY: string;
  CREATED_DATE: string;
  CHANGED_DATE?: string;
  CLOSED_DATE?: string;
  DEADLINE?: string;
  STATUS: string;
  PRIORITY?: string;
  GROUP_ID?: string;
  TAGS?: string[];
  UF_CRM_TASK?: string[];
  inactiveDays?: number;
  lastActivity?: string;
  isOverdue?: boolean;
  priority?: 'normal' | 'warning' | 'critical';
  isInProgress?: boolean;
  executionTime?: number; // в днях
  executionStartDate?: string;
}

export interface BitrixUser {
  ID: string;
  NAME: string;
  LAST_NAME: string;
  EMAIL: string;
  WORK_POSITION?: string;
  UF_DEPARTMENT?: string[];
  ACTIVE: boolean;
  // Дополнительные поля для совместимости
  id?: string;
  name?: string;
}

export interface BitrixDepartment {
  ID: string;
  NAME: string;
  PARENT?: string;
  SORT?: number;
  UF_HEAD?: string;
  CHILDREN?: BitrixDepartment[];
}

export interface TaskStats {
  totalActive: number;
  totalCompleted: number;
  criticalTasks: number;
  warningTasks: number;
  overdueTasks: number;
  inProgressTasks: number;
  byEmployee: Record<string, EmployeeStats>;
  byStatus: Record<string, number>;
  inactivityDistribution: Record<string, number>;
}

export interface EmployeeStats {
  name: string;
  active: number;
  completed: number;
  critical: number;
  warning: number;
  overdue: number;
  inProgress: number;
  avgInactiveDays: number;
  isAbsent?: boolean;
}

export interface BitrixCalendarEvent {
  ID: string;
  NAME: string;
  DESCRIPTION?: string;
  DATE_FROM: string;
  DATE_TO: string;
  SKIP_TIME?: string;
  ACCESSIBILITY?: 'absent' | 'busy' | 'free';
  OWNER_ID: string;
  SECTION_ID?: string;
}

export interface UserAbsenceInfo {
  userId: string;
  isAbsent: boolean;
  absenceType?: string;
  dateFrom?: string;
  dateTo?: string;
  eventName?: string;
  futureAbsence?: {
    dateFrom: string;
    dateTo: string;
    eventName: string;
    daysUntil: number;
  };
}

export interface DashboardData {
  tasks: BitrixTask[];
  completedTasks: BitrixTask[];
  users: BitrixUser[];
  department: BitrixDepartment;
  stats: TaskStats;
  timestamp: string;
  absences?: Record<string, UserAbsenceInfo>;
}