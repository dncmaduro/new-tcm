/**
 * Timeline UI Helpers - Color semantic and status utilities
 * Used for consistent task status visualization
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineTaskStatus = "overdue" | "due-soon" | "in-progress" | "missing-timeline" | "default";

export interface TimelineStatusColors {
  bg: string; // Background color class
  text: string; // Text color class
  border: string; // Border color class
  barBg: string; // Bar background
  badgeBg: string; // Badge background
  badgeText: string; // Badge text
}

export interface TimelineStatusLabels {
  status: string;
  icon?: string;
}

/**
 * Determine task status based on dates and progress
 * @deprecated Use getItemProgressStatus instead for measuring by current/target
 */
export const getTaskStatus = (
  startDate: string | null,
  endDate: string | null,
  progress: number | null | undefined,
  isMissing: boolean = false,
): TimelineTaskStatus => {
  if (isMissing || !startDate || !endDate) {
    return "missing-timeline";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  const safeProgress = Number.isFinite(progress) ? Number(progress) : 0;

  // Done task
  if (safeProgress >= 100) {
    return "default";
  }

  // Overdue
  if (end < today) {
    return "overdue";
  }

  // Due within 7 days
  const diffDays = Math.round((end.getTime() - today.getTime()) / DAY_MS);
  if (diffDays <= 7 && diffDays >= 0) {
    return "due-soon";
  }

  // In progress or not started
  if (safeProgress > 0) {
    return "in-progress";
  }

  return "default";
};

export type ItemProgressStatus = "not-started" | "in-progress" | "overdue" | "completed";

/**
 * Determine item status based on current vs target values and deadline
 * Used for Goals, KRs, and Tasks that have current/target measurements
 */
export const getItemProgressStatus = (
  current: number | null | undefined,
  target: number | null | undefined,
  endDate: string | null,
): ItemProgressStatus => {
  const safeCurrent = Number.isFinite(current) ? Number(current) : 0;
  const safeTarget = Number.isFinite(target) ? Number(target) : 0;

  // Completed: current >= target
  if (safeTarget > 0 && safeCurrent >= safeTarget) {
    return "completed";
  }

  // Overdue always takes precedence when current < target and deadline has passed,
  // including items that have not started yet.
  if (endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    // Overdue: current < target and today is past deadline
    if (safeCurrent < safeTarget && end < today) {
      return "overdue";
    }
  }

  // Not started: current = 0
  if (safeCurrent === 0) {
    return "not-started";
  }

  // In progress: current > 0 and current < target (and not overdue)
  if (safeCurrent > 0 && safeCurrent < safeTarget) {
    return "in-progress";
  }

  return "not-started";
};

/**
 * Get color classes for progress status
 */
export const getProgressStatusColors = (status: ItemProgressStatus) => {
  switch (status) {
    case "not-started":
      return {
        bg: "bg-slate-50/80",
        text: "text-slate-600",
        border: "border-slate-200",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-700",
      };
    case "in-progress":
      return {
        bg: "bg-emerald-50/80",
        text: "text-emerald-700",
        border: "border-emerald-200",
        badgeBg: "bg-emerald-100",
        badgeText: "text-emerald-700",
      };
    case "overdue":
      return {
        bg: "bg-red-50/80",
        text: "text-red-700",
        border: "border-red-200",
        badgeBg: "bg-red-100",
        badgeText: "text-red-700",
      };
    case "completed":
      return {
        bg: "bg-blue-50/80",
        text: "text-blue-700",
        border: "border-blue-200",
        badgeBg: "bg-blue-100",
        badgeText: "text-blue-700",
      };
  }
};

/**
 * Get status label for progress status
 */
export const getProgressStatusLabel = (status: ItemProgressStatus) => {
  switch (status) {
    case "not-started":
      return { status: "Chưa thực hiện", icon: "◯" };
    case "in-progress":
      return { status: "Đang thực hiện", icon: "▶" };
    case "overdue":
      return { status: "Quá hạn", icon: "⚠️" };
    case "completed":
      return { status: "Hoàn thành", icon: "✓" };
  }
};

/**
 * Get color classes for a task status
 */
export const getStatusColors = (status: TimelineTaskStatus): TimelineStatusColors => {
  switch (status) {
    case "overdue":
      return {
        bg: "bg-red-50/80",
        text: "text-red-700",
        border: "border-red-200",
        barBg: "bg-red-500",
        badgeBg: "bg-red-100",
        badgeText: "text-red-700",
      };
    case "due-soon":
      return {
        bg: "bg-amber-50/80",
        text: "text-amber-700",
        border: "border-amber-200",
        barBg: "bg-amber-500",
        badgeBg: "bg-amber-100",
        badgeText: "text-amber-700",
      };
    case "in-progress":
      return {
        bg: "bg-emerald-50/80",
        text: "text-emerald-700",
        border: "border-emerald-200",
        barBg: "bg-emerald-500",
        badgeBg: "bg-emerald-100",
        badgeText: "text-emerald-700",
      };
    case "missing-timeline":
      return {
        bg: "bg-slate-50/80",
        text: "text-slate-600",
        border: "border-slate-200",
        barBg: "bg-slate-400",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-600",
      };
    default:
      return {
        bg: "bg-slate-50/80",
        text: "text-slate-600",
        border: "border-slate-200",
        barBg: "bg-slate-400",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-600",
      };
  }
};

/**
 * Get status label and icon
 */
export const getStatusLabel = (status: TimelineTaskStatus): TimelineStatusLabels => {
  switch (status) {
    case "overdue":
      return { status: "Quá hạn", icon: "⚠️" };
    case "due-soon":
      return { status: "Sắp hết hạn", icon: "⏰" };
    case "in-progress":
      return { status: "Đang thực thi", icon: "▶" };
    case "missing-timeline":
      return { status: "Chưa có mốc", icon: "◯" };
    default:
      return { status: "Bình thường" };
  }
};

/**
 * Check if status needs highlight/warning
 */
export const isStatusAlert = (status: TimelineTaskStatus): boolean => {
  return status === "overdue" || status === "due-soon" || status === "missing-timeline";
};
