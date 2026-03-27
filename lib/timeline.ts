const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseDateValue = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const date = DATE_ONLY_PATTERN.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const startOfLocalDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const formatDateOnlyVi = (
  value: string | null | undefined,
  fallback = "Chưa đặt",
) => {
  if (!value) {
    return fallback;
  }

  const date = parseDateValue(value);
  if (!date) {
    return "Không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(date);
};

export const getTimelineRange = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
) => {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);

  if (!start || !end) {
    return null;
  }

  const normalizedStart = startOfLocalDay(start);
  const normalizedEnd = startOfLocalDay(end);

  if (normalizedEnd.getTime() < normalizedStart.getTime()) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
};

export const isDateRangeOrdered = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
) => {
  if (!startDate || !endDate) {
    return true;
  }

  return getTimelineRange(startDate, endDate) !== null;
};

export const formatTimelineRangeVi = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  options?: {
    fallback?: string;
    missingToken?: string;
  },
) => {
  const fallback = options?.fallback ?? "Chưa đặt khung thời gian";
  const missingToken = options?.missingToken ?? "?";
  const hasStart = Boolean(parseDateValue(startDate));
  const hasEnd = Boolean(parseDateValue(endDate));

  if (!hasStart && !hasEnd) {
    return fallback;
  }

  return `${formatDateOnlyVi(startDate, missingToken)} → ${formatDateOnlyVi(endDate, missingToken)}`;
};

export const getTimelineMissingReason = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  fallback = "Chưa có mốc thời gian",
  invalidFallback = "Mốc thời gian không hợp lệ",
) => {
  if (getTimelineRange(startDate, endDate)) {
    return null;
  }

  if (!startDate || !endDate) {
    return fallback;
  }

  return invalidFallback;
};

export const isTimelineOutsideParent = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  parentStartDate: string | null | undefined,
  parentEndDate: string | null | undefined,
) => {
  const timeline = getTimelineRange(startDate, endDate);
  const parentTimeline = getTimelineRange(parentStartDate, parentEndDate);

  if (!timeline || !parentTimeline) {
    return false;
  }

  return (
    timeline.start.getTime() < parentTimeline.start.getTime() ||
    timeline.end.getTime() > parentTimeline.end.getTime()
  );
};

export const getTimelineOutsideParentWarning = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  parentStartDate: string | null | undefined,
  parentEndDate: string | null | undefined,
  options?: {
    subjectLabel?: string;
    parentLabel?: string;
  },
) => {
  if (!isTimelineOutsideParent(startDate, endDate, parentStartDate, parentEndDate)) {
    return null;
  }

  const subjectLabel = options?.subjectLabel ?? "Công việc";
  const parentLabel = options?.parentLabel ?? "KR";
  return `${subjectLabel} đang nằm ngoài khung thời gian của ${parentLabel}.`;
};
