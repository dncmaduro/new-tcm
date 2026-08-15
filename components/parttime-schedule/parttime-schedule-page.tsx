"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Eye, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppToastStore } from "@/lib/app-toast-store";
import { formatHanoiDate, formatHanoiDateTime, getDefaultRegistrationWeek, getMondayOfWeek, getWeekDates, isBeforeWorkDateInHanoi, isRegistrationClosed, nextWeekStart, previousWeekStart } from "@/lib/parttime-schedule-dates";
import { mapParttimeScheduleError } from "@/lib/parttime-schedule-error";
import type { CreateParttimeChangeRequestInput, ParttimeChangeRequest, ParttimeChangeStatus, ParttimeScheduleEntry, ParttimeShift } from "@/lib/parttime-schedule-types";
import { useCancelParttimeChangeRequest, useCreateParttimeChangeRequest, useCreateParttimeSchedule, useDepartmentParttimeChangeRequests, useFinalizeParttimeSchedule, useMyParttimeChangeRequests, useParttimeSchedule, useParttimeScheduleEntries, useParttimeSchedules, usePublicParttimeSchedules, useRegisterParttimeShift, useReviewParttimeChangeRequest, useUnregisterParttimeShift } from "@/lib/use-parttime-schedule";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { cn } from "@/lib/utils";

type PageMode = "registration" | "manage" | "finalized" | "requests" | "request-management";
const shiftLabel: Record<ParttimeShift, string> = { morning: "Sáng", afternoon: "Chiều" };
const requestLabel = { add: "Thêm ca", remove: "Hủy ca", replace: "Đổi ca" } as const;
const requestStatusLabel: Record<ParttimeChangeStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối", cancelled: "Đã hủy" };
const getScheduleParticipants = (entries: ParttimeScheduleEntry[]) => [...new Map(entries.map((entry) => [entry.profileId, entry.profile?.name ?? "Không rõ"])).values()];

function WeekPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex items-center gap-2"><button type="button" aria-label="Tuần trước" onClick={() => onChange(previousWeekStart(value))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button><input type="date" value={value} onChange={(event) => onChange(getMondayOfWeek(event.target.value))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" /><button type="button" aria-label="Tuần sau" onClick={() => onChange(nextWeekStart(value))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button></div>;
}

function DepartmentPicker({ value, departments, onChange, allLabel }: { value: string; departments: Array<{ id: string; name: string }>; onChange: (value: string) => void; allLabel?: string }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">{allLabel ?? "Chọn phòng ban"}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>;
}

function StatusBadge({ status, automatic }: { status: "open" | "finalized"; automatic?: boolean }) {
  const text = status === "open" ? "Đang mở đăng ký" : automatic ? "Hệ thống tự động chốt" : "Đã được Leader chốt";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", status === "open" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{text}</span>;
}

function PageState({ type, children }: { type: "loading" | "error" | "empty" | "denied"; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border p-6 text-sm", type === "error" ? "border-red-200 bg-red-50 text-red-700" : type === "denied" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600")}>{type === "loading" ? <LoaderCircle className="mb-2 h-5 w-5 animate-spin" /> : null}{children}</div>;
}

function ConfirmDialog({ open, title, description, pending, onOpenChange, onConfirm }: { open: boolean; title: string; description: string; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogFooter><button type="button" disabled={pending} onClick={() => onOpenChange(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Hủy</button><button type="button" disabled={pending} onClick={onConfirm} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Đang xử lý..." : "Xác nhận"}</button></DialogFooter></DialogContent></Dialog>;
}

function ChangeRequestDialog({ scheduleId, weekStart, entries, open, onOpenChange, onComplete }: { scheduleId: string; weekStart: string; entries: ParttimeScheduleEntry[]; open: boolean; onOpenChange: (open: boolean) => void; onComplete: () => Promise<void> }) {
  const createRequest = useCreateParttimeChangeRequest();
  const pushToast = useAppToastStore((state) => state.pushToast);
  const [requestType, setRequestType] = useState<CreateParttimeChangeRequestInput["requestType"]>("add");
  const [entryId, setEntryId] = useState(""); const [workDate, setWorkDate] = useState(""); const [shift, setShift] = useState<ParttimeShift>("morning"); const [reason, setReason] = useState(""); const [error, setError] = useState<string | null>(null);
  const ownActiveEntries = entries.filter((entry) => entry.isActive);
  const submit = async () => {
    setError(null);
    const selected = ownActiveEntries.find((entry) => entry.id === entryId) ?? null;
    if (!reason.trim()) { setError("Vui lòng nhập lý do."); return; }
    if (requestType !== "add" && !selected) { setError("Vui lòng chọn ca hiện tại."); return; }
    if (requestType !== "remove" && (!workDate || !getWeekDates(weekStart).includes(workDate) || isBeforeWorkDateInHanoi(workDate))) { setError("Ngày ca mới phải thuộc tuần lịch và sau ngày hiện tại theo giờ Hà Nội."); return; }
    if (selected && isBeforeWorkDateInHanoi(selected.workDate)) { setError("Không thể thay đổi ca của ngày hiện tại hoặc trong quá khứ."); return; }
    if (requestType === "replace" && selected?.workDate === workDate && selected.shift === shift) { setError("Ca mới phải khác ca hiện tại."); return; }
    try {
      await createRequest.mutateAsync({ scheduleId, requestType, reason: reason.trim(), originalEntryId: requestType === "add" ? null : entryId, requestedWorkDate: requestType === "remove" ? null : workDate, requestedShift: requestType === "remove" ? null : shift });
      pushToast({ title: "Đã gửi yêu cầu", body: "Leader sẽ xem xét thay đổi lịch của bạn.", href: null }); onOpenChange(false); await onComplete();
    } catch (cause) { setError(mapParttimeScheduleError(cause)); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>Tạo yêu cầu thay đổi lịch</DialogTitle><DialogDescription>Lịch đã chốt chỉ có thể thay đổi sau khi Leader duyệt.</DialogDescription></DialogHeader><div className="space-y-4"><label className="block text-sm font-semibold">Loại yêu cầu<select value={requestType} onChange={(event) => { setRequestType(event.target.value as CreateParttimeChangeRequestInput["requestType"]); setEntryId(""); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal"><option value="add">Thêm ca</option><option value="remove">Hủy ca</option><option value="replace">Đổi ca</option></select></label>{requestType !== "add" ? <label className="block text-sm font-semibold">Ca hiện tại<select value={entryId} onChange={(event) => setEntryId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal"><option value="">Chọn ca</option>{ownActiveEntries.map((entry) => <option key={entry.id} value={entry.id}>{formatHanoiDate(entry.workDate)} · {shiftLabel[entry.shift]}</option>)}</select></label> : null}{requestType !== "remove" ? <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Ngày mới<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal" /></label><label className="block text-sm font-semibold">Ca mới<select value={shift} onChange={(event) => setShift(event.target.value as ParttimeShift)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal"><option value="morning">Ca sáng</option><option value="afternoon">Ca chiều</option></select></label></div> : null}<label className="block text-sm font-semibold">Lý do<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal" /></label>{error ? <p className="text-sm text-red-600">{error}</p> : null}</div><DialogFooter><button type="button" onClick={() => onOpenChange(false)} disabled={createRequest.isPending} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Hủy</button><button type="button" onClick={() => void submit()} disabled={createRequest.isPending} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{createRequest.isPending ? "Đang gửi..." : "Gửi yêu cầu"}</button></DialogFooter></DialogContent></Dialog>;
}

type ScheduleBoardItem = { schedule: import("@/lib/parttime-schedule-types").ParttimeSchedule; entries: ParttimeScheduleEntry[] };

function CreateScheduleDialog({ department, weekStart, open, onOpenChange, onComplete }: { department: { id: string; name: string } | null; weekStart: string; open: boolean; onOpenChange: (open: boolean) => void; onComplete: () => Promise<void> }) {
  const createSchedule = useCreateParttimeSchedule();
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!department) { setError("Không xác định được phòng ban bạn đang phụ trách."); return; }
    try {
      await createSchedule.mutateAsync({ departmentId: department.id, weekStart });
      setError(null);
      onOpenChange(false);
      await onComplete();
    } catch (cause) { setError(mapParttimeScheduleError(cause)); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Tạo lịch part-time?</DialogTitle><DialogDescription>Bạn sẽ mở lịch tuần từ {formatHanoiDate(weekStart)} cho phòng ban <strong className="font-semibold text-slate-700">{department?.name ?? "của bạn"}</strong>. Nhân viên part-time thuộc phòng ban này sẽ có thể đăng ký ca.</DialogDescription></DialogHeader>{error ? <p className="text-sm text-red-600">{error}</p> : null}<DialogFooter><button type="button" onClick={() => onOpenChange(false)} disabled={createSchedule.isPending} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Hủy</button><button type="button" onClick={() => void submit()} disabled={createSchedule.isPending || !department} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{createSchedule.isPending ? "Đang tạo..." : "Xác nhận tạo lịch"}</button></DialogFooter></DialogContent></Dialog>;
}

function FinalizedChangeButton({ entry, workDate, shift, disabled, pending, blocked, onSubmit }: { entry: ParttimeScheduleEntry | null; workDate: string; shift: ParttimeShift; disabled: boolean; pending: boolean; blocked: (workDate: string, shift: ParttimeShift) => ParttimeChangeRequest | null; onSubmit: (input: { requestType: "add" | "remove" | "cancel"; entryId: string | null; requestId?: string; workDate: string; shift: ParttimeShift }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestType = entry ? "remove" : "add";
  const pendingRequest = blocked(workDate, shift);
  const isBlocked = Boolean(pendingRequest);
  const confirm = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({ requestType: pendingRequest ? "cancel" : requestType, entryId: entry?.id ?? null, requestId: pendingRequest?.id, workDate, shift });
      setOpen(false);
    } finally { setIsSubmitting(false); }
  };
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" disabled={disabled || pending || isSubmitting} className={cn("rounded px-1.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50", isBlocked ? "border border-slate-300 bg-slate-100 text-slate-600" : entry ? "bg-amber-400 text-amber-950" : "border border-amber-300 bg-amber-50 text-amber-800")}>{isBlocked ? "Đang chờ" : entry ? "Đã đăng ký" : "Đăng ký"}</button></PopoverTrigger><PopoverContent align="center" className="w-64 p-3"><p className="text-sm font-semibold text-slate-800">{isBlocked ? "Hủy yêu cầu thay đổi này?" : entry ? "Yêu cầu hủy ca này?" : "Yêu cầu đăng ký ca này?"}</p><p className="mt-1 text-xs text-slate-500">{isBlocked ? "Sau khi hủy, bạn có thể tạo yêu cầu mới cho ca này." : "Thay đổi sẽ được Leader duyệt trước khi áp dụng."}</p><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold">Đóng</button><button type="button" disabled={pending || isSubmitting} onClick={() => void confirm()} className={cn("h-8 rounded-md px-3 text-xs font-semibold disabled:opacity-60", isBlocked ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950")}>{isSubmitting ? "Đang xử lý..." : isBlocked ? "Hủy yêu cầu" : "Xác nhận"}</button></div></PopoverContent></Popover>;
}

function PendingChangeRequestList({ requests, loading, onReview }: { requests: ParttimeChangeRequest[]; loading: boolean; onReview: (request: ParttimeChangeRequest, approve: boolean) => void }) {
  const requestSlot = (request: ParttimeChangeRequest) => {
    const original = request.originalEntry ? `${formatHanoiDate(request.originalEntry.workDate)} · ${shiftLabel[request.originalEntry.shift]}` : "";
    const requested = request.requestedWorkDate && request.requestedShift ? `${formatHanoiDate(request.requestedWorkDate)} · ${shiftLabel[request.requestedShift]}` : "";
    return request.requestType === "replace" ? `${original} → ${requested}` : request.requestType === "remove" ? original : requested;
  };
  return <section className="mt-5 rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Yêu cầu đang chờ</h3><span className="text-xs text-slate-500">{requests.length}</span></div>{loading ? <p className="text-sm text-slate-500">Đang tải...</p> : requests.length === 0 ? <p className="text-sm text-slate-500">Không có yêu cầu đang chờ.</p> : <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">{requests.map((request) => <article key={request.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-2"><div className="min-w-0 text-sm"><p className="truncate font-semibold">{request.profile?.name ?? "Không rõ"} · {requestLabel[request.requestType]}</p><p className="truncate text-xs text-slate-500">{requestSlot(request)}</p></div><div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => onReview(request, false)} className="h-7 rounded-md border border-red-200 px-2.5 text-xs font-semibold text-red-700">Từ chối</button><button type="button" onClick={() => onReview(request, true)} className="h-7 rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white">Duyệt</button></div></article>)}</div>}</section>;
}

function ScheduleDetailDialog({ item, canRegister, canManage, open, onOpenChange, onComplete, onItemChange }: { item: ScheduleBoardItem | null; canRegister: boolean; canManage: boolean; open: boolean; onOpenChange: (open: boolean) => void; onComplete: () => Promise<ScheduleBoardItem[] | null>; onItemChange: (item: ScheduleBoardItem) => void }) {
  const access = useWorkspaceAccess();
  const register = useRegisterParttimeShift();
  const unregister = useUnregisterParttimeShift();
  const finalize = useFinalizeParttimeSchedule();
  const review = useReviewParttimeChangeRequest();
  const createChangeRequest = useCreateParttimeChangeRequest();
  const cancelChangeRequest = useCancelParttimeChangeRequest();
  const pendingRequests = useDepartmentParttimeChangeRequests(item?.schedule.departmentId ?? null, item?.schedule.weekStart, "pending");
  const myRequests = useMyParttimeChangeRequests(item ? access.profileId : null, item?.schedule.weekStart);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<{ request: ParttimeChangeRequest; approve: boolean } | null>(null);
  const [entryToRemove, setEntryToRemove] = useState<ParttimeScheduleEntry | null>(null);
  if (!item) return null;

  const { schedule, entries } = item;
  const hasPendingChange = (workDate: string, shift: ParttimeShift) => myRequests.data.find((request) => request.scheduleId === schedule.id && request.status === "pending" && ((request.requestedWorkDate === workDate && request.requestedShift === shift) || (request.originalEntry?.workDate === workDate && request.originalEntry.shift === shift))) ?? null;
  const hasAnyPendingChange = myRequests.data.some((request) => request.scheduleId === schedule.id && request.status === "pending");
  const registrationClosed = isRegistrationClosed(schedule.weekStart);
  const ownEntries = entries.filter((entry) => entry.profileId === access.profileId && entry.isActive);
  const canRemoveAnyEntry = schedule.createdBy === access.profileId;
  const locked = schedule.status === "finalized" || registrationClosed;
  const syncSchedule = async () => {
    const refreshedSchedules = await onComplete();
    const refreshedItem = refreshedSchedules?.find((candidate) => candidate.schedule.id === schedule.id) ?? null;
    if (refreshedItem) onItemChange(refreshedItem);
    return refreshedItem;
  };
  const toggleShift = async (workDate: string, shift: ParttimeShift) => {
    const entry = ownEntries.find((candidate) => candidate.workDate === workDate && candidate.shift === shift);
    try {
      if (entry) await unregister.mutateAsync(entry.id);
      else await register.mutateAsync({ departmentId: schedule.departmentId, weekStart: schedule.weekStart, workDate, shift });
      await syncSchedule();
    } catch (cause) {
      useAppToastStore.getState().pushToast({ title: "Không thể cập nhật lịch", body: mapParttimeScheduleError(cause), href: null });
    }
  };
  const removeEntry = async () => {
    if (!entryToRemove) return;
    try {
      await unregister.mutateAsync(entryToRemove.id);
      await syncSchedule();
      setEntryToRemove(null);
      useAppToastStore.getState().pushToast({ title: "Đã xóa đăng ký", body: null, href: null });
    } catch (cause) {
      useAppToastStore.getState().pushToast({ title: "Không thể xóa đăng ký", body: mapParttimeScheduleError(cause), href: null });
    }
  };
  const finalizeSchedule = async () => {
    try {
      await finalize.mutateAsync(schedule.id);
      await syncSchedule();
      setFinalizeConfirmOpen(false);
      useAppToastStore.getState().pushToast({ title: "Đã chốt lịch", body: null, href: null });
    } catch (cause) {
      useAppToastStore.getState().pushToast({ title: "Không thể chốt lịch", body: mapParttimeScheduleError(cause), href: null });
    }
  };
  const reviewRequest = async () => {
    if (!reviewAction) return;
    try {
      await review.mutateAsync({ requestId: reviewAction.request.id, approve: reviewAction.approve });
      await Promise.all([syncSchedule(), pendingRequests.refetch()]);
      setReviewAction(null);
      useAppToastStore.getState().pushToast({ title: reviewAction.approve ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu", body: null, href: null });
    } catch (cause) {
      useAppToastStore.getState().pushToast({ title: "Không thể duyệt yêu cầu", body: mapParttimeScheduleError(cause), href: null });
    }
  };
  const submitFinalizedChange = async ({ requestType, entryId, requestId, workDate, shift }: { requestType: "add" | "remove" | "cancel"; entryId: string | null; requestId?: string; workDate: string; shift: ParttimeShift }) => {
    try {
      if (requestType === "cancel") {
        if (!requestId) return;
        await cancelChangeRequest.mutateAsync(requestId);
        await Promise.all([myRequests.refetch(), pendingRequests.refetch()]);
        useAppToastStore.getState().pushToast({ title: "Đã hủy yêu cầu thay đổi", body: null, href: null });
        return;
      }
      await createChangeRequest.mutateAsync({ scheduleId: schedule.id, requestType, reason: requestType === "add" ? "Yêu cầu thêm ca từ lịch đã chốt." : "Yêu cầu hủy ca từ lịch đã chốt.", originalEntryId: entryId, requestedWorkDate: requestType === "add" ? workDate : null, requestedShift: requestType === "add" ? shift : null });
      await pendingRequests.refetch();
      useAppToastStore.getState().pushToast({ title: "Đã gửi yêu cầu thay đổi", body: "Leader sẽ xem xét yêu cầu của bạn.", href: null });
    } catch (cause) {
      useAppToastStore.getState().pushToast({ title: "Không thể gửi yêu cầu", body: mapParttimeScheduleError(cause), href: null });
      throw cause;
    }
  };

  const renderShift = (date: string, shift: ParttimeShift) => {
    const people = entries.filter((entry) => entry.workDate === date && entry.shift === shift);
    const ownEntry = ownEntries.find((entry) => entry.workDate === date && entry.shift === shift) ?? null;
    const own = Boolean(ownEntry);

    return (
      <div key={shift} className="min-w-0 rounded-lg bg-slate-50 p-2">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-semibold text-slate-500">{shiftLabel[shift]}</p>
          {canRegister ? (
            schedule.status === "finalized" ? (
              <FinalizedChangeButton
                entry={ownEntry}
                workDate={date}
                shift={shift}
                disabled={isBeforeWorkDateInHanoi(date)}
                pending={createChangeRequest.isPending}
                blocked={hasPendingChange}
                onSubmit={submitFinalizedChange}
              />
            ) : (
              <button
                type="button"
                disabled={locked || register.isPending || unregister.isPending}
                onClick={() => void toggleShift(date, shift)}
                className={cn(
                  "rounded px-1.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                  own ? "bg-blue-600 text-white" : "border border-blue-200 bg-white text-blue-700",
                )}
              >
                {own ? "Đã đăng ký" : "Đăng ký"}
              </button>
            )
          ) : null}
        </div>
        <div className="mt-2 min-h-5 space-y-1">
          {people.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-2">
              <p className="truncate text-sm text-slate-700">{entry.profile?.name ?? "Không rõ"}</p>
              {canRemoveAnyEntry ? (
                <button
                  type="button"
                  aria-label={`Xóa đăng ký của ${entry.profile?.name ?? "nhân sự"}`}
                  disabled={unregister.isPending}
                  onClick={() => setEntryToRemove(entry)}
                  className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-[1440px] overflow-y-auto md:w-[calc(100vw-3rem)]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-10">
            <div className="flex items-center gap-2">
              <DialogTitle>{schedule.department?.name ?? "Lịch part-time"}</DialogTitle>
              <StatusBadge status={schedule.status} automatic={schedule.finalizedAutomatically} />
            </div>
            {canManage && schedule.status === "open" ? (
              <button type="button" onClick={() => setFinalizeConfirmOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">
                <ClipboardCheck className="h-4 w-4" />Chốt lịch
              </button>
            ) : null}
          </div>
        </DialogHeader>

        {canRemoveAnyEntry ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Bạn là người tạo lịch nên có thể xóa trực tiếp mọi đăng ký, kể cả khi lịch đã chốt.</p> : null}

        <div className="space-y-3 md:hidden">
          {getWeekDates(schedule.weekStart).map((date) => (
            <section key={date} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold capitalize text-slate-800">{formatHanoiDate(date)}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["morning", "afternoon"] as ParttimeShift[]).map((shift) => renderShift(date, shift))}
              </div>
            </section>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <table className="w-full min-w-[900px] table-fixed text-left">
            <thead className="bg-slate-50">
              <tr>
                {getWeekDates(schedule.weekStart).map((date) => (
                  <th key={date} className="border-r border-slate-200 px-3 py-3 text-sm font-semibold capitalize last:border-r-0">
                    {formatHanoiDate(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {getWeekDates(schedule.weekStart).map((date) => (
                  <td key={date} className="align-top border-r border-t border-slate-200 p-2 last:border-r-0">
                    <div className="space-y-2">
                      {(["morning", "afternoon"] as ParttimeShift[]).map((shift) => renderShift(date, shift))}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {schedule.status === "finalized" && canRegister && hasAnyPendingChange ? <p className="mt-3 text-xs font-medium text-amber-800">Bạn đang có yêu cầu thay đổi chờ Leader xử lý.</p> : null}
        {schedule.status === "finalized" && canManage ? <PendingChangeRequestList requests={pendingRequests.data} loading={pendingRequests.isLoading} onReview={(request, approve) => setReviewAction({ request, approve })} /> : null}
        <ConfirmDialog open={finalizeConfirmOpen} onOpenChange={setFinalizeConfirmOpen} title="Chốt lịch tuần này?" description="Sau khi chốt, nhân viên chỉ có thể thay đổi lịch bằng yêu cầu được Leader duyệt." pending={finalize.isPending} onConfirm={() => void finalizeSchedule()} />
        <ConfirmDialog open={Boolean(reviewAction)} onOpenChange={(isOpen) => !isOpen && setReviewAction(null)} title={reviewAction?.approve ? "Duyệt yêu cầu?" : "Từ chối yêu cầu?"} description="Thay đổi này sẽ được ghi nhận vào lịch part-time." pending={review.isPending} onConfirm={() => void reviewRequest()} />
        <ConfirmDialog open={Boolean(entryToRemove)} onOpenChange={(isOpen) => !isOpen && setEntryToRemove(null)} title="Xóa đăng ký ca này?" description={`Đăng ký của ${entryToRemove?.profile?.name ?? "nhân sự"} sẽ bị xóa khỏi lịch, kể cả khi lịch đã chốt.`} pending={unregister.isPending} onConfirm={() => void removeEntry()} />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleBoard() {
  const access = useWorkspaceAccess();
  const pushToast = useAppToastStore((state) => state.pushToast);
  const [weekStart, setWeekStart] = useState(getDefaultRegistrationWeek);
  const [departmentId, setDepartmentId] = useState("");
  const [selected, setSelected] = useState<ScheduleBoardItem | null>(null);
  const [openingScheduleId, setOpeningScheduleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const leaderDepartmentIds = useMemo(() => new Set(access.memberships.filter((membership) => membership.departmentId && membership.roleId && access.leaderRoleIds.includes(membership.roleId)).map((membership) => membership.departmentId as string)), [access.leaderRoleIds, access.memberships]);
  const leaderDepartments = access.departments.filter((department) => leaderDepartmentIds.has(department.id));
  const schedules = useParttimeSchedules(weekStart, departmentId || undefined);
  const refresh = () => schedules.refetch();
  const select = async (item: ScheduleBoardItem) => {
    setOpeningScheduleId(item.schedule.id);
    try {
      const refreshedSchedules = await schedules.refetch();
      const refreshedItem = refreshedSchedules?.find((candidate) => candidate.schedule.id === item.schedule.id);
      if (refreshedItem) setSelected(refreshedItem);
    } finally {
      setOpeningScheduleId(null);
    }
  };
  const canRegister = (item: ScheduleBoardItem) => access.isParttime && access.memberships.some((membership) => membership.departmentId === item.schedule.departmentId);
  const canManage = (item: ScheduleBoardItem) => leaderDepartmentIds.has(item.schedule.departmentId);
  const createCompleted = async () => { await refresh(); pushToast({ title: "Đã tạo lịch part-time", body: "Lịch mới đã xuất hiện trong danh sách chung.", href: null }); };
  return <div className="space-y-5"><section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Lịch part-time</h2><p className="mt-1 text-sm text-slate-500">Tất cả nhân viên đều có thể xem lịch theo phòng ban và tuần.</p></div><div className="flex flex-wrap gap-2"><WeekPicker value={weekStart} onChange={setWeekStart} /><DepartmentPicker value={departmentId} departments={access.departments} onChange={setDepartmentId} allLabel="Tất cả phòng ban" />{leaderDepartments.length > 0 ? <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Tạo lịch</button> : null}</div></section>{schedules.isLoading ? <PageState type="loading">Đang tải danh sách lịch...</PageState> : schedules.error ? <PageState type="error">{mapParttimeScheduleError(schedules.error)}</PageState> : schedules.data.length === 0 ? <PageState type="empty">Chưa có lịch part-time cho tuần và phòng ban đã chọn.</PageState> : <div className="grid gap-4 lg:grid-cols-2">{schedules.data.map((item) => <article key={item.schedule.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{item.schedule.department?.name ?? "Phòng ban"}</h3><StatusBadge status={item.schedule.status} automatic={item.schedule.finalizedAutomatically} /></div>{getScheduleParticipants(item.entries).length > 0 ? <div className="mt-4 flex flex-wrap gap-2">{getScheduleParticipants(item.entries).map((name) => <span key={name} className="rounded-full bg-slate-100 px-2.5 py-1 text-sm text-slate-700">{name}</span>)}</div> : null}<button type="button" disabled={openingScheduleId === item.schedule.id} onClick={() => void select(item)} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"><Eye className="h-4 w-4" />{openingScheduleId === item.schedule.id ? "Đang tải..." : `Xem chi tiết${canRegister(item) ? " & đăng ký" : ""}`}</button></article>)}</div>}<CreateScheduleDialog department={leaderDepartments[0] ?? null} weekStart={weekStart} open={createOpen} onOpenChange={setCreateOpen} onComplete={createCompleted} /><ScheduleDetailDialog item={selected} canRegister={selected ? canRegister(selected) : false} canManage={selected ? canManage(selected) : false} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} onComplete={refresh} onItemChange={setSelected} /></div>;
}

// Kept only for the legacy direct route while the shared board is the default view.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Registration({ departmentIds, isParttime }: { departmentIds: string[]; isParttime: boolean }) {
  const access = useWorkspaceAccess(); const pushToast = useAppToastStore((state) => state.pushToast); const departments = access.departments.filter((department) => departmentIds.includes(department.id));
  const [weekStart, setWeekStart] = useState(getDefaultRegistrationWeek); const [departmentId, setDepartmentId] = useState(""); const [requestOpen, setRequestOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (departments.length === 1) setDepartmentId(departments[0].id); }, [departments]);
  const schedule = useParttimeSchedule(departmentId || null, weekStart); const entries = useParttimeScheduleEntries(schedule.data?.id ?? null); const myEntries = entries.data.filter((entry) => entry.profileId === access.profileId);
  const register = useRegisterParttimeShift(); const unregister = useUnregisterParttimeShift(); const pending = register.isPending || unregister.isPending;
  const refresh = async () => { await Promise.all([schedule.refetch(), entries.refetch()]); };
  const registrationClosed = isRegistrationClosed(weekStart);
  const onShift = async (date: string, shift: ParttimeShift) => { const entry = myEntries.find((item) => item.workDate === date && item.shift === shift && item.isActive); try { if (entry && schedule.data?.status === "open" && !registrationClosed) await unregister.mutateAsync(entry.id); else if (!entry && schedule.data?.status === "open" && !registrationClosed && departmentId) await register.mutateAsync({ departmentId, weekStart, workDate: date, shift }); else return; pushToast({ title: "Đã cập nhật lịch", body: null, href: null }); await refresh(); } catch (cause) { pushToast({ title: "Không thể cập nhật lịch", body: mapParttimeScheduleError(cause), href: null }); } };
  if (!isParttime) return <PageState type="denied">Tài khoản của bạn chưa được cấu hình là nhân viên part-time nên không thể đăng ký lịch.</PageState>;
  return <div className="space-y-5"><div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Đăng ký lịch làm việc</h2><p className="text-sm text-slate-500">Chọn ca sáng, ca chiều hoặc cả hai ca mỗi ngày.</p></div><div className="flex flex-wrap gap-2"><WeekPicker value={weekStart} onChange={setWeekStart} /><DepartmentPicker value={departmentId} departments={departments} onChange={setDepartmentId} /></div></div>{departments.length === 0 ? <PageState type="denied">Bạn chưa thuộc phòng ban nào để đăng ký lịch part-time.</PageState> : !departmentId ? <PageState type="empty">Hãy chọn phòng ban trước khi đăng ký.</PageState> : schedule.isLoading ? <PageState type="loading">Đang tải lịch tuần...</PageState> : schedule.error ? <PageState type="error">{mapParttimeScheduleError(schedule.error)}</PageState> : <><div className="flex flex-wrap items-center justify-between gap-3"><div>{schedule.data ? <StatusBadge status={schedule.data.status} automatic={schedule.data.finalizedAutomatically} /> : <span className="text-sm text-slate-500">Chưa có đăng ký trong tuần này.</span>}{registrationClosed && schedule.data?.status !== "finalized" ? <p className="mt-1 text-xs text-amber-700">Đăng ký đã đóng từ 07:00 sáng thứ Hai.</p> : null}{schedule.isFetching || entries.isFetching ? <span className="ml-2 text-xs text-slate-400">Đang làm mới...</span> : null}</div>{schedule.data?.status === "finalized" ? <button type="button" onClick={() => setRequestOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Tạo yêu cầu thay đổi</button> : null}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{getWeekDates(weekStart).map((date) => <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="mb-3 text-sm font-semibold capitalize text-slate-800">{formatHanoiDate(date)}</p>{(["morning", "afternoon"] as ParttimeShift[]).map((shift) => { const active = myEntries.some((entry) => entry.workDate === date && entry.shift === shift && entry.isActive); const locked = schedule.data?.status === "finalized" || registrationClosed; return <button key={shift} type="button" disabled={pending || locked} onClick={() => void onShift(date, shift)} className={cn("mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-65", active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50")}><span>Ca {shiftLabel[shift].toLowerCase()}</span>{active ? <Check className="h-4 w-4" /> : null}</button>; })}</div>)}</div>{schedule.data?.status === "finalized" ? <ChangeRequestDialog scheduleId={schedule.data.id} weekStart={schedule.data.weekStart} entries={myEntries} open={requestOpen} onOpenChange={setRequestOpen} onComplete={refresh} /> : null}</>}</div>;
}

function ManageSchedule({ leaderDepartmentIds }: { leaderDepartmentIds: string[] }) {
  const access = useWorkspaceAccess(); const pushToast = useAppToastStore((state) => state.pushToast); const departments = access.departments.filter((department) => leaderDepartmentIds.includes(department.id)); const [departmentId, setDepartmentId] = useState(""); const [weekStart, setWeekStart] = useState(getDefaultRegistrationWeek); const [confirm, setConfirm] = useState(false); const schedule = useParttimeSchedule(departmentId || null, weekStart); const entries = useParttimeScheduleEntries(schedule.data?.id ?? null); const finalize = useFinalizeParttimeSchedule();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (departments.length === 1) setDepartmentId(departments[0].id); }, [departments]);
  const profiles = useMemo(() => [...new Map(entries.data.filter((entry) => entry.isActive).map((entry) => [entry.profileId, entry.profile])).values()], [entries.data]);
  const approve = async () => { if (!schedule.data) return; try { await finalize.mutateAsync(schedule.data.id); pushToast({ title: "Đã chốt lịch tuần", body: "Lịch đã được chuyển sang trạng thái chính thức.", href: null }); setConfirm(false); await Promise.all([schedule.refetch(), entries.refetch()]); } catch (cause) { pushToast({ title: "Không thể chốt lịch", body: mapParttimeScheduleError(cause), href: null }); } };
  if (departments.length === 0) return <PageState type="denied">Chỉ Leader của phòng ban mới có quyền duyệt và chốt lịch.</PageState>;
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div><h2 className="font-semibold">Duyệt lịch phòng ban</h2><p className="text-sm text-slate-500">Leader chốt toàn bộ lịch tuần trong một lần.</p></div><div className="flex flex-wrap gap-2"><WeekPicker value={weekStart} onChange={setWeekStart} /><DepartmentPicker value={departmentId} departments={departments} onChange={setDepartmentId} /></div></div>{!departmentId ? <PageState type="empty">Hãy chọn phòng ban để xem lịch.</PageState> : schedule.isLoading ? <PageState type="loading">Đang tải lịch...</PageState> : schedule.error ? <PageState type="error">{mapParttimeScheduleError(schedule.error)}</PageState> : !schedule.data ? <PageState type="empty">Chưa có nhân viên nào đăng ký lịch tuần này, nên chưa thể chốt lịch.</PageState> : <><div className="flex flex-wrap items-center justify-between gap-3"><div><StatusBadge status={schedule.data.status} automatic={schedule.data.finalizedAutomatically} />{schedule.data.finalizedAt ? <p className="mt-1 text-xs text-slate-500">{schedule.data.finalizedProfile?.name ?? "Hệ thống"} · {formatHanoiDateTime(schedule.data.finalizedAt)}</p> : null}</div><button type="button" disabled={schedule.data.status === "finalized" || finalize.isPending} onClick={() => setConfirm(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><ClipboardCheck className="h-4 w-4" />Duyệt và chốt lịch</button></div><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Nhân viên</th>{getWeekDates(weekStart).map((date) => <th key={date} className="min-w-28 p-3 capitalize">{formatHanoiDate(date)}</th>)}</tr></thead><tbody>{profiles.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-slate-500">Chưa có ca đăng ký đang hoạt động.</td></tr> : profiles.map((profile) => <tr key={profile?.id ?? "unknown"} className="border-t border-slate-100"><td className="p-3 font-medium">{profile?.name ?? "Không rõ"}</td>{getWeekDates(weekStart).map((date) => <td key={date} className="p-3">{(["morning", "afternoon"] as ParttimeShift[]).map((shift) => entries.data.some((entry) => entry.profileId === profile?.id && entry.workDate === date && entry.shift === shift && entry.isActive) ? <span key={shift} className="mr-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{shiftLabel[shift]}</span> : null)}</td>)}</tr>)}</tbody><tfoot className="border-t bg-slate-50"><tr><td className="p-3 font-semibold">Số lượng</td>{getWeekDates(weekStart).map((date) => <td key={date} className="p-3 text-xs"><div>Sáng: {entries.data.filter((entry) => entry.workDate === date && entry.shift === "morning" && entry.isActive).length}</div><div>Chiều: {entries.data.filter((entry) => entry.workDate === date && entry.shift === "afternoon" && entry.isActive).length}</div></td>)}</tr></tfoot></table></div><ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Chốt lịch tuần này?" description="Sau khi chốt, nhân viên chỉ có thể thay đổi lịch qua yêu cầu được Leader duyệt." pending={finalize.isPending} onConfirm={() => void approve()} /></>}</div>;
}

function FinalizedSchedules() {
  const access = useWorkspaceAccess(); const [weekStart, setWeekStart] = useState(getDefaultRegistrationWeek); const [departmentId, setDepartmentId] = useState(""); const publicSchedules = usePublicParttimeSchedules(weekStart, departmentId || undefined);
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div><h2 className="font-semibold">Lịch part-time đã chốt</h2><p className="text-sm text-slate-500">Lịch chính thức của các phòng ban.</p></div><div className="flex flex-wrap gap-2"><WeekPicker value={weekStart} onChange={setWeekStart} /><DepartmentPicker value={departmentId} departments={access.departments} onChange={setDepartmentId} allLabel="Tất cả phòng ban" /></div></div>{publicSchedules.isLoading ? <PageState type="loading">Đang tải lịch đã chốt...</PageState> : publicSchedules.error ? <PageState type="error">{mapParttimeScheduleError(publicSchedules.error)}</PageState> : publicSchedules.data.length === 0 ? <PageState type="empty">Không có lịch đã chốt trong tuần đã chọn.</PageState> : <div className="space-y-4">{publicSchedules.data.map(({ schedule, entries }) => <section key={schedule.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{schedule.department?.name ?? "Phòng ban"}</h3><StatusBadge status="finalized" automatic={schedule.finalizedAutomatically} /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{getWeekDates(weekStart).map((date) => <div key={date} className="rounded-xl bg-slate-50 p-3"><p className="mb-2 text-sm font-semibold capitalize">{formatHanoiDate(date)}</p>{(["morning", "afternoon"] as ParttimeShift[]).map((shift) => <div key={shift} className="mb-2"><p className="text-xs font-semibold text-slate-500">Ca {shiftLabel[shift].toLowerCase()}</p>{entries.filter((entry) => entry.workDate === date && entry.shift === shift).map((entry) => <p key={entry.id} className="mt-1 text-sm text-slate-700">{entry.profile?.name ?? "Không rõ"}</p>) || null}</div>)}</div>)}</div></section>)}</div>}</div>;
}

function RequestList({ leaderDepartmentIds, mode }: { leaderDepartmentIds: string[]; mode: "mine" | "review" }) {
  const access = useWorkspaceAccess(); const pushToast = useAppToastStore((state) => state.pushToast); const [weekStart, setWeekStart] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [status, setStatus] = useState<ParttimeChangeStatus | "">(""); const [employee, setEmployee] = useState(""); const myRequests = useMyParttimeChangeRequests(mode === "mine" ? access.profileId : null, weekStart || undefined); const departmentRequests = useDepartmentParttimeChangeRequests(mode === "review" ? departmentId || null : null, weekStart || undefined, status || undefined); const query = mode === "mine" ? myRequests : departmentRequests; const cancel = useCancelParttimeChangeRequest(); const review = useReviewParttimeChangeRequest(); const [action, setAction] = useState<{ request: ParttimeChangeRequest; approve: boolean } | null>(null); const [comment, setComment] = useState("");
  const data = mode === "review" && employee.trim() ? query.data.filter((item) => item.profile?.name?.toLocaleLowerCase("vi").includes(employee.toLocaleLowerCase("vi"))) : query.data;
  const departments = access.departments.filter((department) => leaderDepartmentIds.includes(department.id));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (mode === "review" && departments.length === 1) setDepartmentId(departments[0].id); }, [departments, mode]);
  const cancelRequest = async (id: string) => { try { await cancel.mutateAsync(id); pushToast({ title: "Đã hủy yêu cầu", body: null, href: null }); await query.refetch(); } catch (cause) { pushToast({ title: "Không thể hủy yêu cầu", body: mapParttimeScheduleError(cause), href: null }); } };
  const submitReview = async () => { if (!action) return; try { await review.mutateAsync({ requestId: action.request.id, approve: action.approve, reviewerComment: comment.trim() || null }); pushToast({ title: action.approve ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu", body: null, href: null }); setAction(null); setComment(""); await query.refetch(); } catch (cause) { pushToast({ title: "Không thể duyệt yêu cầu", body: mapParttimeScheduleError(cause), href: null }); } };
  if (mode === "review" && departments.length === 0) return <PageState type="denied">Chỉ Leader của phòng ban mới xem và duyệt yêu cầu thay đổi.</PageState>;
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div><h2 className="font-semibold">{mode === "mine" ? "Yêu cầu thay đổi của tôi" : "Duyệt yêu cầu thay đổi"}</h2><p className="text-sm text-slate-500">{mode === "mine" ? "Theo dõi trạng thái các yêu cầu đã gửi." : "Duyệt hoặc từ chối yêu cầu của nhân viên trong phòng ban."}</p></div><div className="flex flex-wrap gap-2">{mode === "review" ? <DepartmentPicker value={departmentId} departments={departments} onChange={setDepartmentId} /> : null}<input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} aria-label="Lọc theo tuần" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />{mode === "review" ? <><select value={status} onChange={(event) => setStatus(event.target.value as ParttimeChangeStatus | "")} className="h-10 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Mọi trạng thái</option>{Object.entries(requestStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={employee} onChange={(event) => setEmployee(event.target.value)} placeholder="Lọc nhân viên" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /></> : null}</div></div>{query.isLoading ? <PageState type="loading">Đang tải yêu cầu...</PageState> : query.error ? <PageState type="error">{mapParttimeScheduleError(query.error)}</PageState> : data.length === 0 ? <PageState type="empty">Không có yêu cầu phù hợp.</PageState> : <div className="space-y-3">{data.map((request) => <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-semibold">{requestLabel[request.requestType]}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{requestStatusLabel[request.status]}</span></div><p className="mt-1 text-sm text-slate-500">{mode === "review" ? `${request.profile?.name ?? "Không rõ"} · ` : ""}{request.schedule?.department?.name ?? "Phòng ban"} · tạo {formatHanoiDateTime(request.createdAt)}</p></div>{request.status === "pending" ? mode === "mine" ? <button type="button" disabled={cancel.isPending} onClick={() => void cancelRequest(request.id)} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700">Hủy yêu cầu</button> : <div className="flex gap-2"><button type="button" onClick={() => setAction({ request, approve: false })} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700">Từ chối</button><button type="button" onClick={() => setAction({ request, approve: true })} className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">Duyệt</button></div> : null}</div><div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2"><p>Ca cũ: {request.originalEntry ? `${formatHanoiDate(request.originalEntry.workDate)} · ${shiftLabel[request.originalEntry.shift]}` : "—"}</p><p>Ca yêu cầu: {request.requestedWorkDate && request.requestedShift ? `${formatHanoiDate(request.requestedWorkDate)} · ${shiftLabel[request.requestedShift]}` : "—"}</p><p className="sm:col-span-2">Lý do: {request.reason}</p>{request.reviewedAt ? <p className="sm:col-span-2">Người duyệt: {request.reviewer?.name ?? "Không rõ"} · {formatHanoiDateTime(request.reviewedAt)}{request.reviewerComment ? ` · ${request.reviewerComment}` : ""}</p> : null}</div></article>)}</div>}<Dialog open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{action?.approve ? "Duyệt yêu cầu?" : "Từ chối yêu cầu?"}</DialogTitle><DialogDescription>Thao tác này sẽ được ghi nhận vào lịch part-time.</DialogDescription></DialogHeader><label className="block text-sm font-semibold">Nhận xét (không bắt buộc)<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal" /></label><DialogFooter><button type="button" onClick={() => setAction(null)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Hủy</button><button type="button" disabled={review.isPending} onClick={() => void submitReview()} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">{review.isPending ? "Đang xử lý..." : "Xác nhận"}</button></DialogFooter></DialogContent></Dialog></div>;
}

export function ParttimeSchedulePage({ mode }: { mode: PageMode }) {
  const access = useWorkspaceAccess(); const leaderDepartmentIds = useMemo(() => [...new Set(access.memberships.filter((membership) => membership.departmentId && membership.roleId && access.leaderRoleIds.includes(membership.roleId)).map((membership) => membership.departmentId as string))], [access.leaderRoleIds, access.memberships]);
  const title = mode === "registration" ? "Lịch part-time" : mode === "manage" ? "Duyệt lịch part-time" : mode === "finalized" ? "Lịch part-time đã chốt" : mode === "requests" ? "Yêu cầu thay đổi lịch" : "Duyệt yêu cầu lịch";
  let content: React.ReactNode = mode === "registration" ? <ScheduleBoard /> : mode === "manage" ? <ManageSchedule leaderDepartmentIds={leaderDepartmentIds} /> : mode === "finalized" ? <FinalizedSchedules /> : <RequestList leaderDepartmentIds={leaderDepartmentIds} mode={mode === "requests" ? "mine" : "review"} />;
  if (access.isLoading) content = <PageState type="loading">Đang xác định quyền truy cập...</PageState>; else if (access.error) content = <PageState type="error">{access.error}</PageState>;
  return <div className="min-h-screen bg-[#f3f5fa] text-slate-900"><div className="flex min-h-screen w-full"><WorkspaceSidebar active="parttimeSchedule" /><div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]"><WorkspacePageHeader title={title} items={[{ label: "Lịch part-time" }, ...(mode === "registration" ? [] : [{ label: title }])]} /><main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">{content}</main></div></div></div>;
}
