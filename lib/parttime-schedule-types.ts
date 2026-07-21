export type ParttimeShift = "morning" | "afternoon";
export type ParttimeScheduleStatus = "open" | "finalized";
export type ParttimeChangeType = "add" | "remove" | "replace";
export type ParttimeChangeStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ParttimeProfile = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export type ParttimeDepartment = { id: string; name: string };

export type ParttimeSchedule = {
  id: string;
  departmentId: string;
  weekStart: string;
  status: ParttimeScheduleStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
  finalizedAutomatically: boolean;
  createdBy: string | null;
  department: ParttimeDepartment | null;
  finalizedProfile: ParttimeProfile | null;
};

export type ParttimeScheduleEntry = {
  id: string;
  scheduleId: string;
  profileId: string;
  workDate: string;
  shift: ParttimeShift;
  isActive: boolean;
  removedAt: string | null;
  removedBy: string | null;
  changeRequestId: string | null;
  profile: ParttimeProfile | null;
};

export type ParttimeChangeRequest = {
  id: string;
  scheduleId: string;
  profileId: string;
  requestType: ParttimeChangeType;
  originalEntryId: string | null;
  requestedWorkDate: string | null;
  requestedShift: ParttimeShift | null;
  reason: string;
  status: ParttimeChangeStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerComment: string | null;
  createdAt: string;
  profile: ParttimeProfile | null;
  reviewer: ParttimeProfile | null;
  originalEntry: ParttimeScheduleEntry | null;
  schedule: ParttimeSchedule | null;
};

export type CreateParttimeChangeRequestInput = {
  scheduleId: string;
  requestType: ParttimeChangeType;
  reason: string;
  originalEntryId?: string | null;
  requestedWorkDate?: string | null;
  requestedShift?: ParttimeShift | null;
};

export type ParttimeScheduleQueryResult = {
  schedule: ParttimeSchedule | null;
  entries: ParttimeScheduleEntry[];
};
