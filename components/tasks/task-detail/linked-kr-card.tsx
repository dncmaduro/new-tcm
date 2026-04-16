import Link from "next/link";
import { isKeyResultWeightApplied } from "@/lib/constants/goals";
import {
  formatKeyResultContributionTypeLabel,
  formatKeyResultMetric,
  formatKeyResultTypeLabel,
  formatKeyResultUnit,
} from "@/lib/constants/key-results";
import { formatTimelineRangeVi } from "@/lib/timeline";
import { ProgressSummary } from "./progress-summary";
import { StatItem } from "./stat-item";
import type { KeyResultLiteRow } from "./types";

type LinkedKRCardProps = {
  keyResult: KeyResultLiteRow | null;
  keyResultHref: string | null;
  goalHref: string | null;
  goalName: string;
  keyResultProgress: number;
};

export function LinkedKRCard({
  keyResult,
  keyResultHref,
  goalHref,
  goalName,
  keyResultProgress,
}: LinkedKRCardProps) {
  if (!keyResult) {
    return (
      <article className="rounded-[24px] border border-dashed border-slate-300 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Business Context</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">KR liên kết</h2>
        <p className="mt-3 text-sm text-slate-500">Task này chưa được gắn vào KR nên business context hiện chưa đầy đủ.</p>
      </article>
    );
  }

  const weightApplied = isKeyResultWeightApplied(keyResult.goal?.type, keyResult.contribution_type);

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Business Context</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
            {keyResultHref ? (
              <Link href={keyResultHref} className="transition-colors hover:text-blue-700">
                {keyResult.name}
              </Link>
            ) : (
              keyResult.name
            )}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {formatKeyResultTypeLabel(keyResult.type)} · {formatKeyResultContributionTypeLabel(keyResult.contribution_type)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Goal:{" "}
            {goalHref ? (
              <Link href={goalHref} className="font-medium text-slate-700 transition-colors hover:text-blue-700">
                {goalName}
              </Link>
            ) : (
              <span className="font-medium text-slate-700">{goalName}</span>
            )}
          </p>
        </div>

        <ProgressSummary
          progress={keyResultProgress}
          label="Tiến độ KR"
          statusLabel="Business context"
          tone="blue"
          helper="Task này đang hỗ trợ execution cho KR."
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatItem label="Start" value={formatKeyResultMetric(keyResult.start_value, keyResult.unit)} />
        <StatItem label="Current" value={formatKeyResultMetric(keyResult.current, keyResult.unit)} />
        <StatItem label="Target" value={formatKeyResultMetric(keyResult.target, keyResult.unit)} />
        <StatItem label="Unit" value={formatKeyResultUnit(keyResult.unit)} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatItem
          label="Timeline KR"
          value={formatTimelineRangeVi(keyResult.start_date, keyResult.end_date, {
            fallback: "KR chưa có timeline",
          })}
        />
        <StatItem
          label="Trọng số KR"
          value={weightApplied ? `${Math.round(Number(keyResult.weight ?? 1))}%` : "Không áp dụng"}
          hint={weightApplied ? "Tỷ trọng của KR trong mục tiêu." : "Không dùng trong cách tính hiện tại."}
        />
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
        />
      </div>
    </article>
  );
}
