"use client";

import { create } from "zustand";

/** Query identities retained for a future React Query migration; this feature uses the existing Zustand refresh pattern. */
export const parttimeScheduleKeys = {
  all: ["parttime-schedules"] as const,
  schedules: () => [...parttimeScheduleKeys.all, "schedules"] as const,
  schedule: (departmentId: string, weekStart: string) => [...parttimeScheduleKeys.schedules(), departmentId, weekStart] as const,
  entries: (scheduleId: string) => [...parttimeScheduleKeys.all, "entries", scheduleId] as const,
  publicSchedules: (weekStart: string, departmentId?: string) => [...parttimeScheduleKeys.all, "public", weekStart, departmentId ?? "all"] as const,
  requests: () => [...parttimeScheduleKeys.all, "requests"] as const,
  myRequests: (weekStart?: string) => [...parttimeScheduleKeys.requests(), "mine", weekStart ?? "all"] as const,
  departmentRequests: (departmentId: string, weekStart?: string, status?: string) => [...parttimeScheduleKeys.requests(), "department", departmentId, weekStart ?? "all", status ?? "all"] as const,
};

type ParttimeScheduleCache = { revision: number; invalidate: () => void };
export const useParttimeScheduleCache = create<ParttimeScheduleCache>((set) => ({
  revision: 0,
  invalidate: () => set((state) => ({ revision: state.revision + 1 })),
}));
