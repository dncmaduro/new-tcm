"use client";

import { Button } from "@/components/ui/button";
import { getTaskProgressHint } from "@/lib/constants/tasks";
import {
  formatTimelineRangeVi,
  getTimelineMissingReason,
} from "@/lib/timeline";
import { ProgressSummary } from "./progress-summary";
import { StatItem } from "./stat-item";
import {
  formatTaskPriorityPoints,
  getTaskEarnedPoints,
  getTaskPriorityScore,
} from "./utils";
import type { KeyResultLiteRow, TaskFormState, TaskRow, TaskTimelineFormState } from "./types";

type TaskExecutionSectionProps = {
  task: TaskRow;
  keyResult: KeyResultLiteRow | null;
  form: TaskFormState;
  progressInput: string;
  showTaskPoints: boolean;
  taskTimelineForm: TaskTimelineFormState;
  isEditingTaskInfo: boolean;
  isEditingExecution: boolean;
  isEditingTaskTimeline: boolean;
  isSavingTaskTimeline: boolean;
  taskTimelineInputError: string | null;
  taskTimelineAlignmentWarning: string | null;
  onDescriptionChange: (value: string) => void;
  onHypothesisChange: (value: string) => void;
  onResultChange: (value: string) => void;
  onProgressInputChange: (value: string) => void;
  onProgressInputBlur: () => void;
  onStartTimelineEdit: () => void;
  onCancelTimelineEdit: () => void;
  onSaveTimeline: () => void;
  onTimelineStartChange: (value: string) => void;
  onTimelineEndChange: (value: string) => void;
};

export function TaskExecutionSection({
  task,
  keyResult,
  form,
  progressInput,
  showTaskPoints,
  taskTimelineForm,
  isEditingTaskInfo,
  isEditingExecution,
  isEditingTaskTimeline,
  isSavingTaskTimeline,
  taskTimelineInputError,
  taskTimelineAlignmentWarning,
  onDescriptionChange,
  onHypothesisChange,
  onResultChange,
  onProgressInputChange,
  onProgressInputBlur,
  onStartTimelineEdit,
  onCancelTimelineEdit,
  onSaveTimeline,
  onTimelineStartChange,
  onTimelineEndChange,
}: TaskExecutionSectionProps) {
  const taskTimelineLabel = formatTimelineRangeVi(task.start_date, task.end_date, {
    fallback: "Chưa đặt thời gian thực thi",
  });
  const keyResultTimelineLabel = formatTimelineRangeVi(keyResult?.start_date ?? null, keyResult?.end_date ?? null, {
    fallback: "KR chưa có timeline",
  });
  const goalTimelineLabel = formatTimelineRangeVi(keyResult?.goal?.start_date ?? null, keyResult?.goal?.end_date ?? null, {
    fallback: "Mục tiêu chưa có timeline",
  });
  const executionFormula = "Nhập trực tiếp % hoàn thành của task.";
  const totalPoints = getTaskPriorityScore(form.priority);
  const earnedPoints = getTaskEarnedPoints(form.priority, form.progress);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Execution</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Triển khai</h2>
        <p className="mt-1 text-sm text-slate-500">Ưu tiên cập nhật tiến độ và timeline làm việc.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Tiến độ thực thi</p>
              <p className="mt-1 text-sm text-slate-500">Phản ánh tiến độ làm việc của task, không ghi đè metric của KR.</p>
            </div>
          </div>

          <ProgressSummary progress={form.progress} label="Execution progress" className="mt-4" />

          <div className="mt-4 grid gap-4">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Tiến độ (%)</span>
              {isEditingExecution ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={progressInput}
                  onChange={(event) => onProgressInputChange(event.target.value)}
                  onBlur={onProgressInputBlur}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              ) : (
                <div className="flex h-11 items-center rounded-xl bg-slate-50 px-3">
                  <span className="text-sm font-semibold text-slate-900">{form.progress}%</span>
                </div>
              )}
            </label>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Cách tính</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{executionFormula}</p>
            {showTaskPoints ? (
              <p className="mt-1 text-sm text-slate-700">
                Điểm đã đạt:{" "}
                <span className="font-semibold text-slate-900">
                  {formatTaskPriorityPoints(earnedPoints)} / {formatTaskPriorityPoints(totalPoints)} điểm
                </span>
              </p>
            ) : null}
            <p className="mt-1 text-xs leading-5 text-slate-500">{getTaskProgressHint(form.type)}</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Timeline thực thi</p>
              <p className="mt-1 text-sm text-slate-500">Task có timeline riêng, dùng để theo dõi execution và Gantt.</p>
            </div>

            {isEditingTaskTimeline ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onCancelTimelineEdit} disabled={isSavingTaskTimeline}>
                  Hủy
                </Button>
                <Button onClick={onSaveTimeline} disabled={isSavingTaskTimeline}>
                  {isSavingTaskTimeline ? "Đang lưu..." : "Lưu timeline"}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={onStartTimelineEdit}>
                Sửa timeline
              </Button>
            )}
          </div>

          {isEditingTaskTimeline ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Ngày bắt đầu</span>
                <input
                  type="date"
                  value={taskTimelineForm.startDate}
                  onChange={(event) => onTimelineStartChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Ngày kết thúc</span>
                <input
                  type="date"
                  min={taskTimelineForm.startDate || undefined}
                  value={taskTimelineForm.endDate}
                  onChange={(event) => onTimelineEndChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="md:col-span-2 space-y-1">
                <p className="text-xs leading-5 text-slate-500">
                  Nếu task chưa có ngày, form sẽ ưu tiên lấy timeline hiện tại của KR làm mốc khởi tạo.
                </p>
                {taskTimelineInputError ? (
                  <p className="text-xs leading-5 text-rose-600">{taskTimelineInputError}</p>
                ) : null}
                {!taskTimelineInputError && taskTimelineAlignmentWarning ? (
                  <p className="text-xs leading-5 text-amber-600">{taskTimelineAlignmentWarning}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <StatItem
                label="Timeline task"
                value={taskTimelineLabel}
                hint={
                  getTimelineMissingReason(
                    task.start_date,
                    task.end_date,
                    "Chưa có timeline thực thi.",
                    "Timeline task không hợp lệ.",
                  ) ?? "Dùng cho execution và Gantt."
                }
              />
              <StatItem
                label="Timeline KR"
                value={keyResultTimelineLabel}
                hint={
                  getTimelineMissingReason(
                    keyResult?.start_date ?? null,
                    keyResult?.end_date ?? null,
                    "KR chưa có timeline.",
                    "Timeline KR không hợp lệ.",
                  ) ?? "Mốc tham chiếu cho task."
                }
              />
              <StatItem label="Timeline mục tiêu" value={goalTimelineLabel} />
              <StatItem
                label="Cảnh báo"
                value={taskTimelineAlignmentWarning ?? "Đang nằm trong khung KR"}
                hint={!taskTimelineAlignmentWarning ? "Không có lệch timeline đáng chú ý." : undefined}
              />
            </div>
          )}
        </article>
      </div>

      <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
        <div>
          <p className="text-sm font-semibold text-slate-900">Mô tả triển khai</p>
          <p className="mt-1 text-sm text-slate-500">Giữ ngắn, đủ để người phụ trách hiểu việc cần làm và outcome mong đợi.</p>
        </div>

        {isEditingTaskInfo ? (
          <div className="mt-5 grid gap-4">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Mô tả ngắn</span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Mô tả ngắn những gì cần làm"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Giả thuyết</span>
                <textarea
                  rows={3}
                  value={form.hypothesis}
                  onChange={(event) => onHypothesisChange(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Điều đang giả định để task này hiệu quả"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Kết quả mong đợi</span>
                <textarea
                  rows={3}
                  value={form.result}
                  onChange={(event) => onResultChange(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Outcome cần đạt"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Mô tả</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {task.description?.trim() || "Chưa có mô tả ngắn."}
              </p>
            </div>

            {(task.hypothesis?.trim() || task.result?.trim()) ? (
              <div className="grid gap-3 md:grid-cols-2">
                {task.hypothesis?.trim() ? (
                  <StatItem label="Giả thuyết" value={task.hypothesis} valueClassName="text-sm font-medium text-slate-700" />
                ) : null}
                {task.result?.trim() ? (
                  <StatItem label="Kết quả mong đợi" value={task.result} valueClassName="text-sm font-medium text-slate-700" />
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </article>
    </section>
  );
}
