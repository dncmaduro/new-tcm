import { supabase } from "@/lib/supabase";
import type {
  CreateParttimeChangeRequestInput,
  ParttimeChangeRequest,
  ParttimeChangeStatus,
  ParttimeDepartment,
  ParttimeProfile,
  ParttimeSchedule,
  ParttimeScheduleEntry,
  ParttimeShift,
} from "@/lib/parttime-schedule-types";

type ScheduleRow = {
  id: string;
  department_id: string;
  week_start: string;
  status: "open" | "finalized";
  finalized_at: string | null;
  finalized_by: string | null;
  finalized_automatically: boolean | null;
  created_by: string | null;
};
type EntryRow = {
  id: string;
  schedule_id: string;
  profile_id: string;
  work_date: string;
  shift: ParttimeShift;
  is_active: boolean;
  removed_at: string | null;
  removed_by: string | null;
  change_request_id: string | null;
};
type ProfileRow = { id: string; name: string | null; avatar: string | null };
type DepartmentRow = { id: string; name: string };
type RequestRow = {
  id: string;
  schedule_id: string;
  profile_id: string;
  request_type: "add" | "remove" | "replace";
  original_entry_id: string | null;
  requested_work_date: string | null;
  requested_shift: ParttimeShift | null;
  reason: string;
  status: ParttimeChangeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_comment: string | null;
  created_at: string;
};

const mapProfile = (row: ProfileRow): ParttimeProfile => ({ id: String(row.id), name: row.name, avatar: row.avatar });
const mapEntry = (row: EntryRow, profiles: Map<string, ParttimeProfile>): ParttimeScheduleEntry => ({
  id: String(row.id), scheduleId: String(row.schedule_id), profileId: String(row.profile_id), workDate: String(row.work_date),
  shift: row.shift, isActive: row.is_active === true, removedAt: row.removed_at, removedBy: row.removed_by,
  changeRequestId: row.change_request_id, profile: profiles.get(String(row.profile_id)) ?? null,
});

async function getProfiles(profileIds: string[]) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return new Map<string, ParttimeProfile>();
  const { data, error } = await supabase.from("profiles").select("id,name,avatar").in("id", ids);
  if (error) throw new Error(error.message || "Không tải được thông tin nhân viên.");
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [String(row.id), mapProfile(row)]));
}

async function enrichSchedules(rows: ScheduleRow[]) {
  const departmentIds = [...new Set(rows.map((row) => String(row.department_id)))];
  const profileIds = rows.map((row) => row.finalized_by ?? "").filter(Boolean);
  const [departmentResult, profiles] = await Promise.all([
    departmentIds.length > 0
      ? supabase.from("departments").select("id,name").in("id", departmentIds)
      : Promise.resolve({ data: [] as DepartmentRow[], error: null }),
    getProfiles(profileIds),
  ]);
  if (departmentResult.error) throw new Error(departmentResult.error.message || "Không tải được phòng ban.");
  const departments = new Map(((departmentResult.data ?? []) as DepartmentRow[]).map((row) => [String(row.id), { id: String(row.id), name: String(row.name) } satisfies ParttimeDepartment]));
  const schedules = new Map<string, ParttimeSchedule>();
  rows.forEach((row) => schedules.set(String(row.id), {
    id: String(row.id), departmentId: String(row.department_id), weekStart: String(row.week_start), status: row.status,
    finalizedAt: row.finalized_at, finalizedBy: row.finalized_by, finalizedAutomatically: row.finalized_automatically === true,
    createdBy: row.created_by, department: departments.get(String(row.department_id)) ?? null,
    finalizedProfile: row.finalized_by ? profiles.get(String(row.finalized_by)) ?? null : null,
  }));
  return schedules;
}

export async function getParttimeSchedule(departmentId: string, weekStart: string) {
  const { data, error } = await supabase.from("parttime_schedules").select("*").eq("department_id", departmentId).eq("week_start", weekStart).maybeSingle();
  if (error) throw new Error(error.message || "Không tải được lịch part-time.");
  if (!data) return null;
  return (await enrichSchedules([data as ScheduleRow])).get(String((data as ScheduleRow).id)) ?? null;
}

export async function getParttimeScheduleEntries(scheduleId: string, activeOnly = false) {
  let query = supabase.from("parttime_schedule_entries").select("*").eq("schedule_id", scheduleId);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.order("work_date").order("shift");
  if (error) throw new Error(error.message || "Không tải được các ca đã đăng ký.");
  const rows = (data ?? []) as EntryRow[];
  const profiles = await getProfiles(rows.map((row) => String(row.profile_id)));
  return rows.map((row) => mapEntry(row, profiles));
}

export async function getParttimeScheduleWithEntries(departmentId: string, weekStart: string) {
  const schedule = await getParttimeSchedule(departmentId, weekStart);
  return { schedule, entries: schedule ? await getParttimeScheduleEntries(schedule.id) : [] };
}

export async function getPublicParttimeSchedules(weekStart: string, departmentId?: string) {
  let query = supabase.from("parttime_schedules").select("*").eq("week_start", weekStart).eq("status", "finalized");
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query.order("department_id");
  if (error) throw new Error(error.message || "Không tải được lịch đã chốt.");
  const schedules = await enrichSchedules((data ?? []) as ScheduleRow[]);
  const ids = [...schedules.keys()];
  if (ids.length === 0) return [] as Array<{ schedule: ParttimeSchedule; entries: ParttimeScheduleEntry[] }>;
  const { data: entryData, error: entryError } = await supabase.from("parttime_schedule_entries").select("*").in("schedule_id", ids).eq("is_active", true).order("work_date").order("shift");
  if (entryError) throw new Error(entryError.message || "Không tải được ca đã chốt.");
  const rows = (entryData ?? []) as EntryRow[];
  const profiles = await getProfiles(rows.map((row) => String(row.profile_id)));
  return [...schedules.values()].map((schedule) => ({ schedule, entries: rows.filter((row) => String(row.schedule_id) === schedule.id).map((row) => mapEntry(row, profiles)) }));
}

async function getChangeRequests(filters: { profileId?: string; departmentId?: string; weekStart?: string; status?: ParttimeChangeStatus }) {
  let query = supabase.from("parttime_schedule_change_requests").select("*").order("created_at", { ascending: false });
  if (filters.profileId) query = query.eq("profile_id", filters.profileId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message || "Không tải được yêu cầu thay đổi lịch.");
  const requestRows = (data ?? []) as RequestRow[];
  const scheduleRowsResult = requestRows.length ? await supabase.from("parttime_schedules").select("*").in("id", [...new Set(requestRows.map((row) => row.schedule_id))]) : { data: [] as ScheduleRow[], error: null };
  if (scheduleRowsResult.error) throw new Error(scheduleRowsResult.error.message || "Không tải được lịch của yêu cầu.");
  const schedules = await enrichSchedules((scheduleRowsResult.data ?? []) as ScheduleRow[]);
  const filteredRows = requestRows.filter((row) => {
    const schedule = schedules.get(String(row.schedule_id));
    return Boolean(schedule && (!filters.departmentId || schedule.departmentId === filters.departmentId) && (!filters.weekStart || schedule.weekStart === filters.weekStart));
  });
  const entryIds = filteredRows.map((row) => row.original_entry_id).filter((id): id is string => Boolean(id));
  const entryResult = entryIds.length ? await supabase.from("parttime_schedule_entries").select("*").in("id", entryIds) : { data: [] as EntryRow[], error: null };
  if (entryResult.error) throw new Error(entryResult.error.message || "Không tải được ca gốc.");
  const entryRows = (entryResult.data ?? []) as EntryRow[];
  const profiles = await getProfiles([...filteredRows.flatMap((row) => [row.profile_id, row.reviewed_by ?? ""]), ...entryRows.map((row) => row.profile_id)]);
  const entries = new Map(entryRows.map((row) => [String(row.id), mapEntry(row, profiles)]));
  return filteredRows.map((row): ParttimeChangeRequest => ({
    id: String(row.id), scheduleId: String(row.schedule_id), profileId: String(row.profile_id), requestType: row.request_type,
    originalEntryId: row.original_entry_id, requestedWorkDate: row.requested_work_date, requestedShift: row.requested_shift,
    reason: row.reason, status: row.status, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    reviewerComment: row.reviewer_comment, createdAt: row.created_at, profile: profiles.get(String(row.profile_id)) ?? null,
    reviewer: row.reviewed_by ? profiles.get(String(row.reviewed_by)) ?? null : null,
    originalEntry: row.original_entry_id ? entries.get(String(row.original_entry_id)) ?? null : null,
    schedule: schedules.get(String(row.schedule_id)) ?? null,
  }));
}

export const getMyParttimeChangeRequests = (profileId: string, weekStart?: string) => getChangeRequests({ profileId, weekStart });
export const getDepartmentParttimeChangeRequests = (departmentId: string, weekStart?: string, status?: ParttimeChangeStatus) => getChangeRequests({ departmentId, weekStart, status });

async function callRpc(name: string, args: Record<string, string | boolean | null>) {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Không thể cập nhật lịch part-time.");
}
export const registerParttimeShift = (args: { departmentId: string; weekStart: string; workDate: string; shift: ParttimeShift }) => callRpc("register_parttime_shift", { p_department_id: args.departmentId, p_week_start: args.weekStart, p_work_date: args.workDate, p_shift: args.shift });
export const unregisterParttimeShift = (entryId: string) => callRpc("unregister_parttime_shift", { p_entry_id: entryId });
export const finalizeParttimeSchedule = (scheduleId: string) => callRpc("finalize_parttime_schedule", { p_schedule_id: scheduleId });
export const createParttimeChangeRequest = (input: CreateParttimeChangeRequestInput) => callRpc("create_parttime_change_request", { p_schedule_id: input.scheduleId, p_request_type: input.requestType, p_reason: input.reason, p_original_entry_id: input.originalEntryId ?? null, p_requested_work_date: input.requestedWorkDate ?? null, p_requested_shift: input.requestedShift ?? null });
export const cancelParttimeChangeRequest = (requestId: string) => callRpc("cancel_parttime_change_request", { p_request_id: requestId });
export const reviewParttimeChangeRequest = (input: { requestId: string; approve: boolean; reviewerComment?: string | null }) => callRpc("review_parttime_change_request", { p_request_id: input.requestId, p_approve: input.approve, p_reviewer_comment: input.reviewerComment ?? null });
