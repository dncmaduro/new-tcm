"use client";

import Link from "next/link";
import { ActivityHistoryDialog } from "@/components/activity-history-dialog";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getAllowedKeyResultUnitsByType,
  normalizeKeyResultUnitForType,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import {
  getTaskPriorityOptionLabel,
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskTypeValue,
} from "@/lib/constants/tasks";
import type { TaskFormState } from "./types";
import {
  getTaskTypeLabel,
} from "./utils";
import type { ProfileLiteRow } from "./types";

type TaskOverviewCardProps = {
  taskId: string;
  progress: number;
  keyResultName: string | null;
  keyResultHref: string | null;
  form: TaskFormState;
  assigneeOptions: ProfileLiteRow[];
  isEditing: boolean;
  isEditingProgress: boolean;
  canManage: boolean;
  canUpdateProgress: boolean;
  isSavingTaskInfo: boolean;
  isSavingTaskProgress: boolean;
  isDeletingTask: boolean;
  canSaveEdit: boolean;
  canSaveProgress: boolean;
  progressInput: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onStartProgressEdit: () => void;
  onCancelProgressEdit: () => void;
  onSaveProgress: () => void;
  onDelete: () => void;
  onProgressInputChange: (value: string) => void;
  onProgressInputBlur: () => void;
  onNameChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onTypeChange: (value: TaskTypeValue) => void;
  onPriorityChange: (value: TaskPriority) => void;
  onUnitChange: (value: KeyResultUnitValue) => void;
  onTargetChange: (value: string) => void;
};

export function TaskOverviewCard({
  taskId,
  progress,
  keyResultName,
  keyResultHref,
  form,
  assigneeOptions,
  isEditing,
  isEditingProgress,
  canManage,
  canUpdateProgress,
  isSavingTaskInfo,
  isSavingTaskProgress,
  isDeletingTask,
  canSaveEdit,
  canSaveProgress,
  progressInput,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStartProgressEdit,
  onCancelProgressEdit,
  onSaveProgress,
  onDelete,
  onProgressInputChange,
  onProgressInputBlur,
  onNameChange,
  onAssigneeChange,
  onTypeChange,
  onPriorityChange,
  onUnitChange,
  onTargetChange,
}: TaskOverviewCardProps) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            Thuộc KR{" "}
            {keyResultHref && keyResultName ? (
              <Link href={keyResultHref} className="font-medium text-slate-700 hover:text-blue-700">
                {keyResultName}
              </Link>
            ) : (
              <span className="font-medium text-slate-700">{keyResultName ?? "Chưa gắn KR"}</span>
            )}
          </p>
          <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
            {form.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
              {getTaskTypeLabel(form.type)}
            </span>
          </div>
        </div>
        {!isEditing && !isEditingProgress ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canUpdateProgress ? (
              <button
                type="button"
                onClick={onStartProgressEdit}
                className="inline-flex h-9 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Cập nhật tiến độ
              </button>
            ) : null}
            <ActivityHistoryDialog
              entityType="task"
              entityId={taskId}
              title="Lịch sử hoạt động của công việc"
              triggerClassName="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="inline-flex h-9 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeletingTask}
                  className="inline-flex h-9 items-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingTask ? "Đang xóa..." : "Xóa"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {isEditing && canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSavingTaskInfo}
              className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={!canSaveEdit || isSavingTaskInfo}
              className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isSavingTaskInfo ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        ) : null}
        {isEditingProgress && canUpdateProgress ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelProgressEdit}
              disabled={isSavingTaskProgress}
              className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={onSaveProgress}
              disabled={!canSaveProgress || isSavingTaskProgress}
              className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isSavingTaskProgress ? "Đang lưu..." : "Lưu tiến độ"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-slate-700">Tiến độ công việc ({progress}%)</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        {isEditingProgress ? (
          <div className="mt-4 max-w-[220px] space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Tiến độ (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={progressInput}
              onChange={(event) => onProgressInputChange(event.target.value)}
              onBlur={onProgressInputBlur}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <div className="mt-5 rounded-[20px] border border-blue-100 bg-blue-50/50 p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Tên công việc</span>
              <input
                value={form.name}
                onChange={(event) => onNameChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Người phụ trách</span>
              <Select value={form.assigneeId} onValueChange={onAssigneeChange}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="Chọn người phụ trách" />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name?.trim() || profile.email?.trim() || profile.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Loại công việc</span>
              <Select value={form.type} onValueChange={(value) => onTypeChange(value as TaskTypeValue)}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="Chọn loại công việc" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Phân loại chỉ tiêu</span>
              <Select
                value={form.unit}
                onValueChange={(value) => onUnitChange(normalizeKeyResultUnitForType(form.type, value) as KeyResultUnitValue)}
                disabled={form.type === "okr"}
              >
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder={form.type === "okr" ? "Task OKR dùng phần trăm" : "Chọn loại chỉ tiêu"} />
                </SelectTrigger>
                <SelectContent>
                  {getAllowedKeyResultUnitsByType(form.type).map((unit) => (
                    <SelectItem key={unit.value} value={unit.value}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Độ ưu tiên</span>
              <Select value={form.priority} onValueChange={(value) => onPriorityChange(value as TaskPriority)}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="Chọn độ ưu tiên" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((priority) => (
                    <SelectItem key={priority.value} value={priority.value}>
                      {getTaskPriorityOptionLabel(priority.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Chỉ tiêu cần đạt</span>
              <FormattedNumberInput
                value={form.target}
                disabled={form.type === "okr"}
                onValueChange={onTargetChange}
                className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ${
                  form.type === "okr"
                    ? "cursor-not-allowed bg-slate-50 text-slate-400"
                    : "bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                }`}
                placeholder={form.type === "okr" ? "Task OKR luôn là 100%" : "Ví dụ: 40"}
              />
            </label>
          </div>
        </div>
      ) : null}
    </article>
  );
}
