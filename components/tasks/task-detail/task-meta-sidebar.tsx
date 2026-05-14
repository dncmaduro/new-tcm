import Link from "next/link";
import {
  formatTaskPriorityPoints,
  getTaskEarnedPoints,
  getTaskPriorityBadgeClassName,
  getTaskPriorityLabel,
  getTaskPriorityScore,
} from "./utils";

type TaskMetaSidebarProps = {
  progress: number;
  priority: string;
  showTaskPoints: boolean;
  assigneeName: string;
  timelineLabel: string;
  goalName: string;
  goalHref: string | null;
  keyResultName: string | null;
  keyResultHref: string | null;
  creatorName: string;
  createdAtLabel: string;
  updatedAtLabel: string;
};

export function TaskMetaSidebar({
  progress,
  priority,
  showTaskPoints,
  assigneeName,
  timelineLabel,
  goalName,
  goalHref,
  keyResultName,
  keyResultHref,
  creatorName,
  createdAtLabel,
  updatedAtLabel,
}: TaskMetaSidebarProps) {
  const totalPoints = getTaskPriorityScore(priority);
  const earnedPoints = getTaskEarnedPoints(priority, progress);

  return (
    <aside className="self-start space-y-4 xl:sticky">
      <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
        <h2 className="text-base font-semibold text-slate-900">Thông tin chi tiết</h2>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Người phụ trách</span>
            <span className="text-right font-medium text-slate-800">{assigneeName}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Tiến độ (%)</span>
            <span className="text-right font-medium text-slate-800">{progress}%</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Độ ưu tiên</span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(priority)}`}
            >
              {getTaskPriorityLabel(priority)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Thời gian thực thi</span>
            <span className="text-right font-medium text-slate-800">{timelineLabel}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Thuộc KR</span>
            <span className="max-w-[220px] text-right font-medium text-slate-800">
              {keyResultHref && keyResultName ? (
                <Link href={keyResultHref} className="transition-colors hover:text-blue-700">
                  {keyResultName}
                </Link>
              ) : (
                (keyResultName ?? "Chưa gắn KR")
              )}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Thuộc mục tiêu</span>
            <span className="max-w-[220px] text-right font-medium text-slate-800">
              {goalHref ? (
                <Link href={goalHref} className="transition-colors hover:text-blue-700">
                  {goalName}
                </Link>
              ) : (
                goalName
              )}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
            <span className="text-slate-500">Người tạo</span>
            <span className="text-right font-medium text-slate-800">{creatorName}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Thời gian tạo</span>
            <span className="text-right font-medium text-slate-800">{createdAtLabel}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Cập nhật lần cuối</span>
            <span className="text-right font-medium text-slate-800">{updatedAtLabel}</span>
          </div>
        </div>
      </article>
    </aside>
  );
}
