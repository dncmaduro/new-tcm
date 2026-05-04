"use client";

import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatKeyResultMetric,
  formatKeyResultUnit,
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
import { StatItem } from "./stat-item";
import type { TaskFormState } from "./types";
import {
  formatTaskPriorityPoints,
  getTaskCycleLabel,
  getTaskEarnedPoints,
  getTaskPriorityBadgeClassName,
  getTaskPriorityLabel,
  getTaskPriorityScore,
  getTaskTypeLabel,
} from "./utils";

type TaskOverviewCardProps = {
  form: TaskFormState;
  assigneeName: string;
  creatorName: string;
  timelineLabel: string;
  isEditing: boolean;
  showTaskPoints: boolean;
  onNameChange: (value: string) => void;
  onTypeChange: (value: TaskTypeValue) => void;
  onPriorityChange: (value: TaskPriority) => void;
  onUnitChange: (value: KeyResultUnitValue) => void;
  onTargetChange: (value: string) => void;
  onRecurringChange: (value: boolean) => void;
};

export function TaskOverviewCard({
  form,
  assigneeName,
  creatorName,
  timelineLabel,
  isEditing,
  showTaskPoints,
  onNameChange,
  onTypeChange,
  onPriorityChange,
  onUnitChange,
  onTargetChange,
  onRecurringChange,
}: TaskOverviewCardProps) {
  const priorityScore = getTaskPriorityScore(form.priority);
  const earnedPoints = getTaskEarnedPoints(form.priority, form.progress);

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Overview</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Tóm tắt nhanh</h2>
          <p className="mt-1 text-sm text-slate-500">Những thông tin cần quét nhanh trước khi làm việc.</p>
        </div>
      </div>

      {isEditing ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Tên task</span>
            <input
              value={form.name}
              onChange={(event) => onNameChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Loại task</span>
            <Select value={form.type} onValueChange={(value) => onTypeChange(value as TaskTypeValue)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Chọn loại task" />
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
              <SelectTrigger className="h-11">
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
              <SelectTrigger className="h-11">
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
              className={`h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ${
                form.type === "okr"
                  ? "cursor-not-allowed bg-slate-50 text-slate-400"
                  : "bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              }`}
              placeholder={form.type === "okr" ? "Task OKR luôn là 100%" : "Ví dụ: 40"}
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(event) => onRecurringChange(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">Task lặp lại</span>
          </label>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatItem label="Người phụ trách" value={assigneeName} />
          <StatItem label="Timeline" value={timelineLabel} />
          <StatItem label="Loại task" value={getTaskTypeLabel(form.type)} />
          <StatItem
            label="Độ ưu tiên"
            value={
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(form.priority)}`}
              >
                {getTaskPriorityLabel(form.priority)}
              </span>
            }
          />
          <StatItem label="Phân loại chỉ tiêu" value={formatKeyResultUnit(form.unit)} />
          <StatItem label="Chỉ tiêu cần đạt" value={formatKeyResultMetric(Number(form.target || 0), form.unit)} />
          {showTaskPoints ? (
            <StatItem
              label="Điểm task"
              value={`${formatTaskPriorityPoints(earnedPoints)} / ${formatTaskPriorityPoints(priorityScore)} điểm`}
            />
          ) : null}
          <StatItem label="Chu kỳ" value={getTaskCycleLabel(form.isRecurring)} />
          <StatItem label="Người tạo" value={creatorName} />
        </div>
      )}
    </article>
  );
}
