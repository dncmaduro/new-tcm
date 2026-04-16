import { getTimelineRange, startOfLocalDay } from "@/lib/timeline";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineScale = "day" | "week" | "month";

export type TimelinePeriod = {
  key: string;
  start: Date;
  end: Date;
  label: string;
  subLabel: string;
};

export type TimelineBarLayout = {
  left: number;
  width: number;
  rawLeft: number;
  rawWidth: number;
  isClamped: boolean;
};

export const TIMELINE_BASE_PERIOD_WIDTH: Record<TimelineScale, number> = {
  day: 68,
  week: 92,
  month: 128,
};

export const TIMELINE_MIN_PERIOD_WIDTH: Record<TimelineScale, number> = {
  day: 48,
  week: 28,
  month: 28,
};

export const TIMELINE_PERIOD_PADDING: Record<TimelineScale, number> = {
  day: 7,
  week: 3,
  month: 1,
};

export const TIMELINE_MIN_PERIOD_COUNT: Record<TimelineScale, number> = {
  day: 1000,
  week: 240,
  month: 60,
};

export const TIMELINE_MIN_ZOOM = 0.6;
export const TIMELINE_MAX_ZOOM = 2.4;
export const TIMELINE_ZOOM_STEP = 0.2;
export const TIMELINE_MIN_BAR_WIDTH = 10;
export const TIMELINE_BAR_SIDE_PADDING = 6;

export const clampTimelineZoom = (value: number) =>
  Math.min(TIMELINE_MAX_ZOOM, Math.max(TIMELINE_MIN_ZOOM, Number(value.toFixed(2))));

export const getPeriodWidthForZoom = (scale: TimelineScale, zoomLevel: number) =>
  Math.max(
    TIMELINE_MIN_PERIOD_WIDTH[scale],
    Math.round(TIMELINE_BASE_PERIOD_WIDTH[scale] * clampTimelineZoom(zoomLevel)),
  );

export const startOfWeek = (value: Date) => {
  const next = startOfLocalDay(value);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
};

export const startOfMonth = (value: Date) => {
  const next = startOfLocalDay(value);
  next.setDate(1);
  return next;
};

export const startOfScale = (value: Date, scale: TimelineScale) => {
  if (scale === "week") {
    return startOfWeek(value);
  }
  if (scale === "month") {
    return startOfMonth(value);
  }
  return startOfLocalDay(value);
};

export const addScale = (value: Date, scale: TimelineScale, amount: number) => {
  const next = new Date(value);
  if (scale === "week") {
    next.setDate(next.getDate() + amount * 7);
    return next;
  }
  if (scale === "month") {
    next.setMonth(next.getMonth() + amount);
    return next;
  }
  next.setDate(next.getDate() + amount);
  return next;
};

export const endOfScale = (value: Date, scale: TimelineScale) => {
  const next = addScale(startOfScale(value, scale), scale, 1);
  next.setMilliseconds(next.getMilliseconds() - 1);
  return next;
};

const getTimelinePeriodCount = (start: Date, end: Date, scale: TimelineScale) => {
  const normalizedStart = startOfScale(start, scale);
  const normalizedEnd = startOfScale(end, scale);

  if (scale === "day") {
    return Math.max(1, Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / DAY_MS) + 1);
  }

  if (scale === "week") {
    return Math.max(
      1,
      Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / (DAY_MS * 7)) + 1,
    );
  }

  return Math.max(
    1,
    (normalizedEnd.getFullYear() - normalizedStart.getFullYear()) * 12 +
      (normalizedEnd.getMonth() - normalizedStart.getMonth()) +
      1,
  );
};

export const formatTimelinePeriodLabel = (date: Date, scale: TimelineScale) => {
  if (scale === "day") {
    return {
      label: new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date),
      subLabel: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date),
    };
  }

  if (scale === "week") {
    const end = endOfScale(date, scale);
    return {
      label: `Tuần ${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date)}`,
      subLabel: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(end),
    };
  }

  return {
    label: new Intl.DateTimeFormat("vi-VN", { month: "long" }).format(date),
    subLabel: new Intl.DateTimeFormat("vi-VN", { year: "numeric" }).format(date),
  };
};

export const buildTimelinePeriods = (
  items: Array<{ startDate: string | null; endDate: string | null }>,
  scale: TimelineScale,
) => {
  const today = new Date();
  const allDates = items.flatMap((item) => {
    const timeline = getTimelineRange(item.startDate, item.endDate);
    if (!timeline) {
      return [];
    }
    return [timeline.start, timeline.end];
  });

  const minDate = allDates.length
    ? new Date(Math.min(...allDates.map((date) => date.getTime()), today.getTime()))
    : today;
  const maxDate = allDates.length
    ? new Date(Math.max(...allDates.map((date) => date.getTime()), today.getTime()))
    : today;

  const paddedStart = addScale(startOfScale(minDate, scale), scale, -TIMELINE_PERIOD_PADDING[scale]);
  const paddedEnd = addScale(startOfScale(maxDate, scale), scale, TIMELINE_PERIOD_PADDING[scale]);
  const paddedPeriodCount = getTimelinePeriodCount(paddedStart, paddedEnd, scale);
  const extraPeriods = Math.max(0, TIMELINE_MIN_PERIOD_COUNT[scale] - paddedPeriodCount);
  const effectiveStart = addScale(paddedStart, scale, -Math.ceil(extraPeriods / 2));
  const effectiveEnd = addScale(paddedEnd, scale, Math.floor(extraPeriods / 2));
  const periods: TimelinePeriod[] = [];

  for (
    let cursor = startOfScale(effectiveStart, scale);
    cursor.getTime() <= effectiveEnd.getTime();
    cursor = addScale(cursor, scale, 1)
  ) {
    const formatted = formatTimelinePeriodLabel(cursor, scale);
    periods.push({
      key: `${scale}-${cursor.toISOString()}`,
      start: cursor,
      end: endOfScale(cursor, scale),
      label: formatted.label,
      subLabel: formatted.subLabel,
    });
  }

  return periods;
};

const getDaysInMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();

export const getTimelineOffsetPx = (axisStart: Date, value: Date, scale: TimelineScale, periodWidth: number) => {
  const normalized = startOfLocalDay(value);

  if (scale === "day") {
    return ((normalized.getTime() - axisStart.getTime()) / DAY_MS) * periodWidth;
  }

  if (scale === "week") {
    const weekStart = startOfWeek(normalized);
    const weekDiff = (weekStart.getTime() - axisStart.getTime()) / (DAY_MS * 7);
    const dayOffset = (normalized.getTime() - weekStart.getTime()) / DAY_MS;
    return (weekDiff + dayOffset / 7) * periodWidth;
  }

  const monthStart = startOfMonth(normalized);
  const monthDiff =
    (monthStart.getFullYear() - axisStart.getFullYear()) * 12 + (monthStart.getMonth() - axisStart.getMonth());
  const dayOffset = (normalized.getDate() - 1) / getDaysInMonth(monthStart);
  return (monthDiff + dayOffset) * periodWidth;
};

export const getTimelineBarLayout = ({
  startDate,
  endDate,
  axisStart,
  timelineWidth,
  scale,
  periodWidth,
  minBarWidth = TIMELINE_MIN_BAR_WIDTH,
  sidePadding = TIMELINE_BAR_SIDE_PADDING,
}: {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  axisStart: Date;
  timelineWidth: number;
  scale: TimelineScale;
  periodWidth: number;
  minBarWidth?: number;
  sidePadding?: number;
}) => {
  const timeline = getTimelineRange(startDate, endDate);
  if (!timeline) {
    return null;
  }

  const inclusiveEndExclusive = addScale(timeline.end, "day", 1);
  const rawStart = getTimelineOffsetPx(axisStart, timeline.start, scale, periodWidth);
  const rawEnd = getTimelineOffsetPx(axisStart, inclusiveEndExclusive, scale, periodWidth);
  const rawWidth = Math.max(1, rawEnd - rawStart);

  const safeLeft = Math.max(0, rawStart + sidePadding);
  const drawableWidth = Math.max(1, rawWidth - sidePadding * 2);
  const renderedWidth = Math.max(drawableWidth, minBarWidth);
  const maxWidth = Math.max(1, timelineWidth - safeLeft - sidePadding);
  const width = Math.min(renderedWidth, maxWidth);

  return {
    left: safeLeft,
    width,
    rawLeft: rawStart,
    rawWidth: drawableWidth,
    isClamped: width > drawableWidth,
  } satisfies TimelineBarLayout;
};

export const getTodayIndicatorOffsetPx = (axisStart: Date, scale: TimelineScale, periodWidth: number, now = new Date()) => {
  if (scale === "day") {
    const dayStart = startOfLocalDay(now);
    const minutesOffset = (now.getTime() - dayStart.getTime()) / DAY_MS;
    return getTimelineOffsetPx(axisStart, dayStart, scale, periodWidth) + minutesOffset * periodWidth;
  }

  if (scale === "week") {
    const dayStart = startOfLocalDay(now);
    return getTimelineOffsetPx(axisStart, dayStart, scale, periodWidth) + periodWidth / 14;
  }

  const dayStart = startOfLocalDay(now);
  const monthStart = startOfMonth(dayStart);
  const intraMonthOffset = 0.5 / getDaysInMonth(monthStart);
  return getTimelineOffsetPx(axisStart, dayStart, scale, periodWidth) + intraMonthOffset * periodWidth;
};

export const getTimelineDurationDays = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
) => {
  const timeline = getTimelineRange(startDate, endDate);
  if (!timeline) {
    return null;
  }

  return Math.round((timeline.end.getTime() - timeline.start.getTime()) / DAY_MS) + 1;
};

export const formatTimelineDurationVi = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
) => {
  const durationDays = getTimelineDurationDays(startDate, endDate);
  if (!durationDays) {
    return "Không xác định";
  }
  if (durationDays === 1) {
    return "1 ngày";
  }
  return `${durationDays} ngày`;
};

export const getFitZoomLevel = ({
  availableWidth,
  periodCount,
  scale,
}: {
  availableWidth: number;
  periodCount: number;
  scale: TimelineScale;
}) => {
  if (availableWidth <= 0 || periodCount <= 0) {
    return 1;
  }

  return clampTimelineZoom(availableWidth / (periodCount * TIMELINE_BASE_PERIOD_WIDTH[scale]));
};
