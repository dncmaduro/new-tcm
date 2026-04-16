import Link from "next/link";
import { ProgressSummary } from "./progress-summary";
import { StatItem } from "./stat-item";
import { TaskStatusBadge } from "./task-status-badge";
import { getTaskStatusMeta } from "./utils";

type TaskMetaSidebarProps = {
  status: string | null | undefined;
  progress: number;
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
  status,
  progress,
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
  const statusMeta = getTaskStatusMeta(status);

  return (
    <aside className="self-start space-y-4 xl:sticky xl:top-6">
      <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Quick Glance</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-slate-950">Thông tin nhanh</h2>
          </div>
          <TaskStatusBadge status={status} className="px-2.5 py-1 text-xs" />
        </div>

        <ProgressSummary
          progress={progress}
          label="Progress"
          statusLabel={statusMeta.label}
          tone={statusMeta.tone}
          variant="compact"
          className="mt-4"
        />

        <div className="mt-4 space-y-3">
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
