"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelParttimeChangeRequest,
  createParttimeChangeRequest,
  finalizeParttimeSchedule,
  getDepartmentParttimeChangeRequests,
  getMyParttimeChangeRequests,
  getParttimeSchedule,
  getParttimeScheduleEntries,
  getPublicParttimeSchedules,
  registerParttimeShift,
  reviewParttimeChangeRequest,
  unregisterParttimeShift,
} from "@/lib/parttime-schedule-api";
import type {
  CreateParttimeChangeRequestInput,
  ParttimeChangeRequest,
  ParttimeChangeStatus,
  ParttimeSchedule,
  ParttimeScheduleEntry,
  ParttimeShift,
} from "@/lib/parttime-schedule-types";
import { useParttimeScheduleCache } from "@/lib/parttime-schedule-cache";

type QueryState<T> = { data: T; isLoading: boolean; isFetching: boolean; error: string | null; refetch: () => Promise<void> };

function useAsyncQuery<T>(enabled: boolean, key: string, initial: T, loader: () => Promise<T>): QueryState<T> {
  const revision = useParttimeScheduleCache((state) => state.revision);
  const [data, setData] = useState<T>(initial);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  const initialRef = useRef(initial);
  loaderRef.current = loader;
  initialRef.current = initial;
  const refetch = useCallback(async () => {
    if (!enabled) { setData(initialRef.current); setIsLoading(false); return; }
    setIsFetching(true); setError(null);
    try { setData(await loaderRef.current()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu."); }
    finally { setIsLoading(false); setIsFetching(false); }
  }, [enabled]);
  useEffect(() => { void refetch(); }, [key, refetch, revision]);
  return { data, isLoading, isFetching, error, refetch };
}

export function useParttimeSchedule(departmentId: string | null, weekStart: string) {
  return useAsyncQuery<ParttimeSchedule | null>(Boolean(departmentId), `${departmentId ?? ""}:${weekStart}`, null, () => getParttimeSchedule(departmentId as string, weekStart));
}
export function useParttimeScheduleEntries(scheduleId: string | null, activeOnly = false) {
  return useAsyncQuery<ParttimeScheduleEntry[]>(Boolean(scheduleId), `${scheduleId ?? ""}:${activeOnly}`, [], () => getParttimeScheduleEntries(scheduleId as string, activeOnly));
}
export function usePublicParttimeSchedules(weekStart: string, departmentId?: string) {
  return useAsyncQuery(Boolean(weekStart), `${weekStart}:${departmentId ?? "all"}`, [], () => getPublicParttimeSchedules(weekStart, departmentId));
}
export function useMyParttimeChangeRequests(profileId: string | null, weekStart?: string) {
  return useAsyncQuery<ParttimeChangeRequest[]>(Boolean(profileId), `${profileId ?? ""}:${weekStart ?? "all"}`, [], () => getMyParttimeChangeRequests(profileId as string, weekStart));
}
export function useDepartmentParttimeChangeRequests(departmentId: string | null, weekStart?: string, status?: ParttimeChangeStatus) {
  return useAsyncQuery<ParttimeChangeRequest[]>(Boolean(departmentId), `${departmentId ?? ""}:${weekStart ?? "all"}:${status ?? "all"}`, [], () => getDepartmentParttimeChangeRequests(departmentId as string, weekStart, status));
}

function useParttimeMutation<T>(mutation: (input: T) => Promise<void>) {
  const [isPending, setIsPending] = useState(false);
  const invalidate = useParttimeScheduleCache((state) => state.invalidate);
  const mutateAsync = useCallback(async (input: T) => { setIsPending(true); try { await mutation(input); invalidate(); } finally { setIsPending(false); } }, [invalidate, mutation]);
  return { isPending, mutateAsync };
}
export const useRegisterParttimeShift = () => useParttimeMutation((input: { departmentId: string; weekStart: string; workDate: string; shift: ParttimeShift }) => registerParttimeShift(input));
export const useUnregisterParttimeShift = () => useParttimeMutation((entryId: string) => unregisterParttimeShift(entryId));
export const useFinalizeParttimeSchedule = () => useParttimeMutation((scheduleId: string) => finalizeParttimeSchedule(scheduleId));
export const useCreateParttimeChangeRequest = () => useParttimeMutation((input: CreateParttimeChangeRequestInput) => createParttimeChangeRequest(input));
export const useCancelParttimeChangeRequest = () => useParttimeMutation((requestId: string) => cancelParttimeChangeRequest(requestId));
export const useReviewParttimeChangeRequest = () => useParttimeMutation((input: { requestId: string; approve: boolean; reviewerComment?: string | null }) => reviewParttimeChangeRequest(input));
