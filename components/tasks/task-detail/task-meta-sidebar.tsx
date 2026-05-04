import Link from "next/link";
import { ProgressSummary } from "./progress-summary";
import { StatItem } from "./stat-item";
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
    <aside className="self-start space-y-4 xl:sticky xl:top-6">
      <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Quick Glance</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-slate-950">Thông tin nhanh</h2>
          </div>
        </div>

        <ProgressSummary progress={progress} label="Progress" variant="compact" className="mt-4" />

        <div className="mt-4 space-y-3">
          <StatItem
            label="Độ ưu tiên"
            value={
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(priority)}`}
              >
                {getTaskPriorityLabel(priority)}
              </span>
            }
            compact
          />
          {showTaskPoints ? (
            <StatItem
              label="Điểm task"
              value={`${formatTaskPriorityPoints(earnedPoints)} / ${formatTaskPriorityPoints(totalPoints)} điểm`}
              compact
            />
          ) : null}
          <StatItem label="Assignee" value={assigneeName} compact />
          <StatItem label="Timeline" value={timelineLabel} compact />
          <StatItem
            label="Goal"
            value={
              goalHref ? (
                <Link href={goalHref} className="transition-colors hover:text-blue-700">
                  {goalName}
                </Link>
              ) : (
                goalName
              )
            }
            compact
          />
          <StatItem
            label="KR"
            value={
              keyResultHref && keyResultName ? (
                <Link href={keyResultHref} className="transition-colors hover:text-blue-700">
                  {keyResultName}
                </Link>
              ) : (
                keyResultName ?? "Chưa gắn KR"
              )
            }
            compact
          />
          <StatItem label="Created by" value={creatorName} compact />
          <StatItem label="Updated" value={updatedAtLabel} hint={`Tạo lúc ${createdAtLabel}`} compact />
        </div>
      </article>
    </aside>
  );
}
