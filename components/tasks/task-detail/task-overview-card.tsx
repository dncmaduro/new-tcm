"use client";

import { ClearableNumberInput } from "@/components/ui/clearable-number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_TYPES, type TaskTypeValue } from "@/lib/constants/tasks";
import { StatItem } from "./stat-item";
import type { TaskFormState } from "./types";
import { getTaskCycleLabel, getTaskTypeLabel } from "./utils";

type TaskOverviewCardProps = {
  form: TaskFormState;
  assigneeName: string;
  creatorName: string;
  timelineLabel: string;
  isEditing: boolean;
  onNameChange: (value: string) => void;
  onTypeChange: (value: TaskTypeValue) => void;
  onWeightChange: (value: number) => void;
  onRecurringChange: (value: boolean) => void;
};

export function TaskOverviewCard({
  form,
  assigneeName,
  creatorName,
  timelineLabel,
  isEditing,
  onNameChange,
  onTypeChange,
  onWeightChange,
  onRecurringChange,
}: TaskOverviewCardProps) {
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
            <span className="text-sm font-semibold text-slate-700">Trọng số</span>
            <ClearableNumberInput
              min={1}
              value={form.weight}
              onValueChange={onWeightChange}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
          <StatItem label="Trọng số" value={`${Math.round(form.weight)}%`} />
          <StatItem label="Chu kỳ" value={getTaskCycleLabel(form.isRecurring)} />
          <StatItem label="Người tạo" value={creatorName} />
        </div>
      )}
    </article>
  );
}
