import type { KeyResultUnitValue } from "@/lib/constants/key-results";
import type { TaskPriority, TaskStatusValue, TaskTypeValue } from "@/lib/constants/tasks";

export type GoalLiteRow = {
  id: string;
  name: string;
  type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type KeyResultLiteRow = {
  id: string;
  goal_id: string | null;
  name: string;
  type: string | null;
  contribution_type: string | null;
  current: number | null;
  start_value: number | null;
  target: number | null;
  unit: string | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  goal?: GoalLiteRow | null;
};

export type TaskRow = {
  id: string;
  key_result_id: string | null;
  assignee_id: string | null;
  profile_id: string | null;
  creator_profile_id: string | null;
  type: string | null;
  name: string;
  description: string | null;
  current: number | null;
  progress: number | null;
  weight: number | null;
  status: string | null;
  unit: string | null;
  target: number | null;
  note: string | null;
  is_recurring: boolean | null;
  hypothesis: string | null;
  result: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: string | null;
  created_at: string | null;
  updated_at: string | null;
  key_result?: KeyResultLiteRow | null;
};

export type ProfileLiteRow = {
  id: string;
  name: string | null;
  email: string | null;
};

export type TaskFormState = {
  name: string;
  description: string;
  note: string;
  isRecurring: boolean;
  hypothesis: string;
  result: string;
  type: TaskTypeValue;
  priority: TaskPriority;
  status: TaskStatusValue;
  unit: KeyResultUnitValue;
  target: string;
  progress: number;
  weight: number;
};

export type TaskTimelineFormState = {
  startDate: string;
  endDate: string;
};

export type TaskDetailBreadcrumb = {
  label: string;
  href?: string;
};

export type ProgressTone = "slate" | "blue" | "emerald" | "rose";

export type TaskHeaderAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "outline";
};
