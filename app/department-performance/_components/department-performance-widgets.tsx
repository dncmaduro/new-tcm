"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Info, LineChart, Target } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateShortVi } from "@/lib/dashboard";
import { formatKeyResultMetric } from "@/lib/constants/key-results";
import {
  type DepartmentDirectKeyResultItem,
  type DepartmentExecutionContextItem,
  type DepartmentGoalChartItem,
  type DepartmentGoalPerformanceItem,
  type DepartmentKrStructureSegment,
  type DepartmentMemberContributionItem,
  type DepartmentPerformanceHealth,
  type DepartmentRiskDeadlineItem,
  type DepartmentSupportKeyResultItem,
  type DepartmentTrendPoint,
} from "@/app/department-performance/use-department-performance";

const healthLabelMap: Record<DepartmentPerformanceHealth, string> = {
  on_track: "Đúng tiến độ",
  at_risk: "Cần theo dõi",
  off_track: "Chậm tiến độ",
  achieved: "Đạt mục tiêu",
};

const goalStatusLabelMap: Record<string, string> = {
  draft: "Nháp",
  active: "Đang hoạt động",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  "Chưa đặt": "Chưa đặt",
};

const memberStatusLabelMap: Record<DepartmentMemberContributionItem["status"], string> = {
  strong: "Đóng góp tốt",
  watching: "Cần theo dõi",
  bottleneck: "Cần chú ý",
};

function getHealthTone(health: DepartmentPerformanceHealth) {
  if (health === "achieved") {
    return "emerald";
  }
  if (health === "on_track") {
    return "blue";
  }
  if (health === "at_risk") {
    return "amber";
  }
  return "rose";
}

function ProgressBar({
  value,
  tone = "blue",
  heightClassName = "h-2.5",
}: {
  value: number;
  tone?: "blue" | "emerald" | "amber" | "rose";
  heightClassName?: string;
}) {
  const toneClassName =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "rose"
          ? "bg-rose-500"
          : "bg-blue-600";

  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-slate-100", heightClassName)}>
      <div className={cn("h-full rounded-full transition-[width]", toneClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm leading-6 text-slate-500">
      {text}
    </div>
  );
}

function BlockState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText: string;
}) {
  if (loading) {
    return <EmptyPanel text="Đang tải dữ liệu hiệu suất..." />;
  }
  if (error) {
    return <EmptyPanel text={error} />;
  }
  if (empty) {
    return <EmptyPanel text={emptyText} />;
  }
  return null;
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p> : null}
      <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
      {description ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}

function HelperNote({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <span>{children}</span>
    </div>
  );
}

function HealthBadge({ health }: { health: DepartmentPerformanceHealth }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
        health === "achieved" && "bg-emerald-50 text-emerald-700",
        health === "on_track" && "bg-blue-50 text-blue-700",
        health === "at_risk" && "bg-amber-50 text-amber-700",
        health === "off_track" && "bg-rose-50 text-rose-700",
      )}
    >
      {healthLabelMap[health]}
    </span>
  );
}

function MemberStatusBadge({ status }: { status: DepartmentMemberContributionItem["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
        status === "strong" && "bg-emerald-50 text-emerald-700",
        status === "watching" && "bg-amber-50 text-amber-700",
        status === "bottleneck" && "bg-rose-50 text-rose-700",
      )}
    >
      {memberStatusLabelMap[status]}
    </span>
  );
}

function MetricReadout({
  value,
  unit = "%",
  loading,
}: {
  value: number | null;
  unit?: "%" | "count";
  loading?: boolean;
}) {
  if (loading) {
    return <span className="text-slate-400">Đang tải</span>;
  }
  if (value === null) {
    return <span className="text-slate-400">Chưa có dữ liệu</span>;
  }
  return <>{unit === "%" ? `${value}%` : value}</>;
}

function formatDepartmentMetric(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Chưa đặt";
  }
  return formatKeyResultMetric(Number(value), unit ?? null);
}

function formatDaysRemaining(daysRemaining: number | null) {
  if (daysRemaining === null) {
    return "Chưa đặt hạn";
  }
  if (daysRemaining < 0) {
    return `Quá hạn ${Math.abs(daysRemaining)} ngày`;
  }
  if (daysRemaining === 0) {
    return "Đến hạn hôm nay";
  }
  return `Còn ${daysRemaining} ngày`;
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "Chưa có";
  }
  return formatDateShortVi(value);
}

function formatSignedPoints(value: number | null) {
  if (value === null) {
    return "Chưa có";
  }
  if (value === 0) {
    return "Đúng kế hoạch";
  }
  return `${value > 0 ? "+" : ""}${value} điểm`;
}

function formatWeeklyPace(value: number | null, emptyText = "Chưa đủ dữ liệu") {
  if (value === null) {
    return emptyText;
  }
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(1)} điểm/tuần`;
}

function formatRecentProgressChange(value: number | null) {
  if (value === null) {
    return "Chưa có đủ mốc cập nhật để tính biến động gần đây.";
  }
  if (value === 0) {
    return "14 ngày gần đây chưa có thêm tiến độ mới.";
  }
  return `14 ngày gần đây ${value > 0 ? "tăng" : "giảm"} ${Math.abs(value)} điểm tiến độ.`;
}

function GoalStatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function GoalInsightCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
      <div className="mt-2 text-sm leading-6 text-slate-700">{children}</div>
    </div>
  );
}

function GoalTrendSparkline({
  points,
}: {
  points: DepartmentGoalPerformanceItem["trendPoints"];
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
        Chưa có lịch sử cập nhật tiến độ để vẽ xu hướng.
      </div>
    );
  }

  const width = 320;
  const height = 92;
  const paddingX = 10;
  const paddingY = 10;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : 0;

  const coordinates = points.map((point, index) => {
    const x = paddingX + index * xStep;
    const y = paddingY + ((100 - point.progress) / 100) * chartHeight;
    return { ...point, x, y };
  });

  const linePoints =
    coordinates.length > 1
      ? coordinates.map((point) => `${point.x},${point.y}`).join(" ")
      : `${coordinates[0]?.x ?? paddingX},${coordinates[0]?.y ?? height / 2}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Xu hướng tiến độ</p>
          <p className="mt-1 text-xs text-slate-500">Dựng từ lịch sử các lần cập nhật tiến độ của mục tiêu.</p>
        </div>
        <span className="text-xs text-slate-500">{points.length} mốc</span>
      </div>
      <div className="mt-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full">
          {[0, 50, 100].map((tick) => {
            const y = paddingY + ((100 - tick) / 100) * chartHeight;
            return (
              <line key={tick} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
            );
          })}
          {coordinates.length > 1 ? (
            <polyline
              points={linePoints}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {coordinates.map((point) => (
            <circle key={point.id} cx={point.x} cy={point.y} r="4" fill="#2563eb" />
          ))}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{points[0]?.label ?? "Bắt đầu"}</span>
        <span>{points[points.length - 1]?.label ?? "Hôm nay"}</span>
      </div>
    </div>
  );
}

type ProgressSortOption = "attention" | "progress_asc" | "progress_desc";

function isNeedsAttentionHealth(health: DepartmentPerformanceHealth) {
  return health === "at_risk" || health === "off_track";
}

function compareByProgress<TValue extends { progress: number; health: DepartmentPerformanceHealth; endDate: string | null }>(
  a: TValue,
  b: TValue,
  direction: "asc" | "desc",
) {
  if (a.progress !== b.progress) {
    return direction === "asc" ? a.progress - b.progress : b.progress - a.progress;
  }

  const healthScore = (health: DepartmentPerformanceHealth) =>
    health === "off_track" ? 0 : health === "at_risk" ? 1 : health === "on_track" ? 2 : 3;

  if (healthScore(a.health) !== healthScore(b.health)) {
    return healthScore(a.health) - healthScore(b.health);
  }

  const aDate = a.endDate ? new Date(a.endDate).getTime() : Number.POSITIVE_INFINITY;
  const bDate = b.endDate ? new Date(b.endDate).getTime() : Number.POSITIVE_INFINITY;
  return aDate - bDate;
}

function ProgressSortToolbar({
  needsAttentionText,
  totalText,
  sortOption,
  onSortChange,
}: {
  needsAttentionText: string;
  totalText: string;
  sortOption: ProgressSortOption;
  onSortChange: (value: ProgressSortOption) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700">
          {needsAttentionText}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
          {totalText}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-600">Sắp xếp</span>
        <Select value={sortOption} onValueChange={(value) => onSortChange(value as ProgressSortOption)}>
          <SelectTrigger className="h-10 w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="attention">Ưu tiên mục cần chú ý</SelectItem>
            <SelectItem value="progress_asc">Tiến độ hiện tại: thấp đến cao</SelectItem>
            <SelectItem value="progress_desc">Tiến độ hiện tại: cao đến thấp</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function getPaceToneClass(scheduleGap: number | null) {
  if (scheduleGap === null) {
    return "bg-slate-100 text-slate-700";
  }
  if (scheduleGap <= -15) {
    return "bg-rose-50 text-rose-700";
  }
  if (scheduleGap >= 15) {
    return "bg-emerald-50 text-emerald-700";
  }
  return "bg-amber-50 text-amber-700";
}

function PaceAssessmentCell({
  paceLabel,
  paceNote,
  scheduleGap,
}: {
  paceLabel: string;
  paceNote: string;
  scheduleGap: number | null;
}) {
  return (
    <div className="min-w-[220px]">
      <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", getPaceToneClass(scheduleGap))}>
        {paceLabel}
      </span>
      <p className="mt-2 text-xs leading-5 text-slate-500">{paceNote}</p>
    </div>
  );
}

function SummaryInfoPopover({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Giải thích chỉ số ${title}`}
          className="grid h-6 w-6 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs rounded-2xl border border-slate-200 p-3">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </PopoverContent>
    </Popover>
  );
}

function SummaryCard({
  title,
  value,
  unit,
  helper,
  info,
  note,
  badgeLabel,
  tone,
  loading,
}: {
  title: string;
  value: number | null;
  unit: "%" | "count";
  helper: string;
  info: string;
  note: string;
  badgeLabel: string;
  tone: "blue" | "emerald" | "amber" | "rose";
  loading: boolean;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-600">{title}</p>
            <SummaryInfoPopover title={title} description={info} />
          </div>
          <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.05em] text-slate-950">
            <MetricReadout value={value} unit={unit} loading={loading} />
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            tone === "blue" && "bg-blue-50 text-blue-700",
            tone === "emerald" && "bg-emerald-50 text-emerald-700",
            tone === "amber" && "bg-amber-50 text-amber-700",
            tone === "rose" && "bg-rose-50 text-rose-700",
          )}
        >
          {badgeLabel}
        </span>
      </div>
      {unit === "%" && !loading && value !== null ? (
        <div className="mt-4">
          <ProgressBar value={value} tone={tone} />
        </div>
      ) : null}
      <p className="mt-4 text-sm font-medium text-slate-700">{note}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </article>
  );
}

export function DepartmentSummaryCards({
  summary,
  loading,
}: {
  summary: {
    goalPerformance: number | null;
    keyResultPerformance: number | null;
    businessPerformance: number | null;
    goalsAtRisk: number;
    trackedGoals: number;
    directKrCount: number;
    supportKrCount: number;
  };
  loading: boolean;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-4">
      <SummaryCard
        title="Hiệu suất hoàn thành mục tiêu"
        value={summary.goalPerformance}
        unit="%"
        note={`${summary.trackedGoals} mục tiêu đang theo dõi`}
        helper="Trung bình tiến độ của các mục tiêu đang theo dõi trong phạm vi hiện tại."
        info="Lấy trung bình phần trăm tiến độ của các mục tiêu đang theo dõi. Không tính các mục tiêu đã hoàn thành hoặc đã hủy."
        badgeLabel="Tiến độ"
        tone="blue"
        loading={loading}
      />
      <SummaryCard
        title="Hiệu suất hoàn thành KR"
        value={summary.keyResultPerformance}
        unit="%"
        note={`${summary.directKrCount + summary.supportKrCount} KR trong phạm vi`}
        helper="Trung bình tiến độ của toàn bộ KR trực tiếp và KR hỗ trợ trong phạm vi hiện tại."
        info="Lấy trung bình phần trăm tiến độ của tất cả KR thuộc bộ lọc hiện tại, gồm cả KR trực tiếp và KR hỗ trợ. Mỗi KR đóng góp như nhau vào card này."
        badgeLabel="Tiến độ"
        tone="amber"
        loading={loading}
      />
      <SummaryCard
        title="Hiệu suất kinh doanh"
        value={summary.businessPerformance}
        unit="%"
        note={`${summary.directKrCount} KR trực tiếp trong phạm vi`}
        helper="Tổng hợp trung bình từ các KR trực tiếp, là tín hiệu gần nhất với kết quả kinh doanh."
        info="Lấy tiến độ của các KR trực tiếp và tính trung bình. Mỗi KR trực tiếp đóng góp như nhau vào card này."
        badgeLabel="Tín hiệu chính"
        tone="emerald"
        loading={loading}
      />
      <SummaryCard
        title="Mục tiêu rủi ro"
        value={summary.goalsAtRisk}
        unit="count"
        note={`${summary.trackedGoals} mục tiêu đang theo dõi`}
        helper="Số mục tiêu đang chậm tiến độ hoặc có KR rơi vào vùng cần chú ý."
        info="Đếm các mục tiêu đang theo dõi có health ở mức at_risk hoặc off_track, hoặc có direct/support KR nằm trong vùng rủi ro."
        badgeLabel="Cần chú ý"
        tone="rose"
        loading={loading}
      />
    </section>
  );
}

function AnalyticsCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function AnalyticsTrendChart({ points }: { points: DepartmentTrendPoint[] }) {
  const hasRenderablePoints =
    points.length >= 2 &&
    points.some(
      (point) =>
        point.overallPerformance !== null || point.businessPerformance !== null || point.supportPerformance !== null,
    );

  if (!hasRenderablePoints) {
    return <EmptyPanel text="Chưa có dữ liệu xu hướng cho kỳ này." />;
  }

  const width = 640;
  const height = 240;
  const paddingX = 22;
  const paddingY = 18;
  const chartHeight = height - paddingY * 2;
  const chartWidth = width - paddingX * 2;
  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth;
  const series = [
    { key: "overallPerformance", label: "Hiệu suất phòng ban", color: "#2563eb" },
    { key: "businessPerformance", label: "Hiệu suất kinh doanh", color: "#059669" },
    { key: "supportPerformance", label: "Hiệu suất hỗ trợ", color: "#d97706" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-[linear-gradient(180deg,rgba(239,246,255,0.7),rgba(255,255,255,1))] p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = paddingY + ((100 - tick) / 100) * chartHeight;
            return (
              <g key={tick}>
                <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />
                <text x={0} y={y + 4} fontSize="11" fill="#94a3b8">
                  {tick}%
                </text>
              </g>
            );
          })}
          {series.map((serie) => {
            const definedPoints = points
              .map((point, index) => {
                const value = point[serie.key];
                if (value === null) {
                  return null;
                }
                const x = paddingX + index * xStep;
                const y = paddingY + ((100 - value) / 100) * chartHeight;
                return `${x},${y}`;
              })
              .filter((value): value is string => Boolean(value));

            return definedPoints.length >= 2 ? (
              <polyline
                key={serie.key}
                points={definedPoints.join(" ")}
                fill="none"
                stroke={serie.color}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null;
          })}
          {points.map((point, index) => {
            const x = paddingX + index * xStep;
            return (
              <g key={point.key}>
                {series.map((serie) => {
                  const value = point[serie.key];
                  if (value === null) {
                    return null;
                  }
                  const y = paddingY + ((100 - value) / 100) * chartHeight;
                  return <circle key={`${point.key}-${serie.key}`} cx={x} cy={y} r="4.5" fill={serie.color} />;
                })}
                <text x={x} y={height - 4} textAnchor="middle" fontSize="12" fill="#64748b">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-500">
        {series.map((serie) => (
          <span key={serie.key} className="inline-flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serie.color }} />
            {serie.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function GoalProgressChart({ items }: { items: DepartmentGoalChartItem[] }) {
  if (items.length === 0) {
    return <EmptyPanel text="Chưa có mục tiêu phù hợp để so sánh tiến độ." />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {item.typeLabel} · {item.ownersSummary}
              </p>
            </div>
            <span className="text-sm font-semibold text-slate-900">{item.progress}%</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={item.progress} tone={getHealthTone(item.health)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KrStructureChart({
  total,
  segments,
}: {
  total: number;
  segments: DepartmentKrStructureSegment[];
}) {
  if (total === 0) {
    return <EmptyPanel text="Chưa có KR trực tiếp hoặc KR hỗ trợ trong bộ lọc hiện tại." />;
  }

  const segmentColors: Record<DepartmentKrStructureSegment["key"], string> = {
    direct_on_track: "#2563eb",
    support_on_track: "#0f766e",
    needs_attention: "#e11d48",
  };

  const gradientStops = segments
    .reduce<{ stops: string[]; start: number }>(
      (acc, segment) => {
        const percentage = total > 0 ? (segment.count / total) * 100 : 0;
        const next = acc.start + percentage;
        acc.stops.push(`${segmentColors[segment.key]} ${acc.start}% ${next}%`);
        return {
          stops: acc.stops,
          start: next,
        };
      },
      { stops: [], start: 0 },
    )
    .stops.join(", ");

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
      <div className="mx-auto">
        <div
          className="grid h-[190px] w-[190px] place-items-center rounded-full"
          style={{ background: `conic-gradient(${gradientStops})` }}
        >
          <div className="grid h-[126px] w-[126px] place-items-center rounded-full bg-white text-center">
            <div>
              <p className="text-[34px] font-semibold leading-none tracking-[-0.04em] text-slate-950">{total}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">KR trong phạm vi</p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {segments.map((segment) => (
          <div key={segment.key} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{segment.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{segment.note}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-3 w-3 rounded-full"
                  style={{ backgroundColor: segmentColors[segment.key] }}
                />
                <span className="text-sm font-semibold text-slate-900">{segment.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DepartmentAnalyticsSection({
  analytics,
  loading,
  error,
}: {
  analytics: {
    trend: DepartmentTrendPoint[];
    goalProgress: DepartmentGoalChartItem[];
    krStructure: {
      total: number;
      segments: DepartmentKrStructureSegment[];
    };
  };
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Phân tích trực quan</p>
        <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-slate-950">Tín hiệu cần đọc trước khi xuống chi tiết</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Biểu đồ ở đây ưu tiên quyết định quản trị: nhìn xu hướng chung, xác định mục tiêu yếu nhất và xem vấn đề nằm ở KR trực tiếp hay KR hỗ trợ.
        </p>
      </div>
      {loading || error ? (
        <BlockState loading={loading} error={error} emptyText="" />
      ) : (
        <div className="grid gap-4 2xl:grid-cols-[1.35fr_1fr_1fr]">
          <AnalyticsCard
            icon={<LineChart className="h-5 w-5" />}
            title="Xu hướng hiệu suất"
            description="Dựng theo các kỳ mục tiêu hiện có trong phạm vi lọc. Nếu chỉ còn một mốc, hệ thống giữ trạng thái trống thay vì vẽ xu hướng giả."
          >
            <AnalyticsTrendChart points={analytics.trend} />
          </AnalyticsCard>
          <AnalyticsCard
            icon={<Target className="h-5 w-5" />}
            title="Mục tiêu cần chú ý"
            description="Sắp theo mục tiêu yếu nhất lên trước để nhận diện ngay phần đang kéo hiệu suất xuống."
          >
            <GoalProgressChart items={analytics.goalProgress} />
          </AnalyticsCard>
          <AnalyticsCard
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Cấu trúc KR"
            description="Tách rõ KR trực tiếp đạt tiến độ, KR hỗ trợ đạt tiến độ và nhóm KR đang chậm hoặc rủi ro."
          >
            <KrStructureChart total={analytics.krStructure.total} segments={analytics.krStructure.segments} />
          </AnalyticsCard>
        </div>
      )}
    </section>
  );
}

export function DepartmentGoalsSection({
  goals,
  loading,
  error,
}: {
  goals: DepartmentGoalPerformanceItem[];
  loading: boolean;
  error: string | null;
}) {
  const [sortOption, setSortOption] = useState<ProgressSortOption>("attention");
  const needsAttentionCount = useMemo(
    () => goals.filter((goal) => isNeedsAttentionHealth(goal.health) || goal.directKrRiskCount > 0 || goal.supportKrRiskCount > 0).length,
    [goals],
  );
  const sortedGoals = useMemo(() => {
    if (sortOption === "progress_asc") {
      return [...goals].sort((a, b) => compareByProgress(a, b, "asc"));
    }
    if (sortOption === "progress_desc") {
      return [...goals].sort((a, b) => compareByProgress(a, b, "desc"));
    }
    return goals;
  }, [goals, sortOption]);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <SectionHeading
        eyebrow="Mục tiêu"
        title="Hiệu suất mục tiêu"
      />
      <div className="px-6 py-6">
        {loading || error || goals.length === 0 ? (
          <BlockState
            loading={loading}
            error={error}
            empty={goals.length === 0}
            emptyText="Không có mục tiêu phù hợp với bộ lọc hiện tại."
          />
        ) : (
          <div className="space-y-4">
            <ProgressSortToolbar
              needsAttentionText={`${needsAttentionCount} mục tiêu cần chú ý`}
              totalText={`${goals.length} mục tiêu trong phạm vi`}
              sortOption={sortOption}
              onSortChange={setSortOption}
            />
            {sortedGoals.map((goal) => (
              <div key={goal.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/goals/${goal.id}`} className="block truncate text-xl font-semibold tracking-[-0.02em] text-slate-950 hover:text-blue-700">
                      {goal.name}
                    </Link>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{goal.typeLabel}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {goalStatusLabelMap[goal.status] ?? goal.status}
                      </span>
                      <HealthBadge health={goal.health} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                      <span>
                        <span className="font-medium text-slate-900">Người phụ trách:</span> {goal.ownersSummary}
                      </span>
                      <span>
                        <span className="font-medium text-slate-900">Hạn cuối:</span> {formatShortDate(goal.endDate)}
                      </span>
                      <span>{formatDaysRemaining(goal.daysRemaining)}</span>
                      <span>
                        <span className="font-medium text-slate-900">Cập nhật gần nhất:</span> {formatShortDate(goal.lastActivityAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                  <GoalStatCard label="Tiến độ hiện tại" value={`${goal.progress}%`} note="Tỷ lệ hoàn thành tại thời điểm hiện tại." />
                  <GoalStatCard
                    label="Theo kế hoạch"
                    value={goal.expectedProgress === null ? "Chưa có" : `${goal.expectedProgress}%`}
                    note="Mức nên đạt tới hôm nay theo thời gian bắt đầu và hạn cuối."
                  />
                  <GoalStatCard
                    label="Lệch kế hoạch"
                    value={formatSignedPoints(goal.scheduleGap)}
                    note="Âm là đang chậm hơn kế hoạch, dương là đang đi nhanh hơn."
                  />
                  <GoalStatCard
                    label="Nhịp 2 tuần"
                    value={formatWeeklyPace(goal.velocityPerWeek)}
                    note={formatRecentProgressChange(goal.recentProgressChange)}
                  />
                  <GoalStatCard
                    label="Cần để kịp hạn"
                    value={formatWeeklyPace(goal.requiredPerWeek, "Không áp dụng")}
                    note="Nhịp cần giữ từ bây giờ đến hạn cuối để chạm 100%."
                  />
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-white bg-white p-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Hiệu suất mục tiêu</p>
                          <p className="mt-2 text-[36px] font-semibold leading-none tracking-[-0.04em] text-slate-950">{goal.progress}%</p>
                        </div>
                        <p className="text-sm text-slate-500">{goal.metricSummary}</p>
                      </div>
                      <div className="mt-4">
                        <ProgressBar value={goal.progress} tone={getHealthTone(goal.health)} heightClassName="h-3" />
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">{goal.riskNote}</p>
                    </div>
                    <GoalTrendSparkline points={goal.trendPoints} />
                  </div>

                  <div className="space-y-3">
                    <GoalInsightCard title="Cần cải thiện ngay">
                      <p className="font-medium text-slate-900">{goal.actionText}</p>
                    </GoalInsightCard>
                    <GoalInsightCard title="Chỉ số mục tiêu">
                      <p className="font-medium text-slate-900">{goal.metricSummary}</p>
                      <p className="mt-2 text-slate-600">
                        {goal.startDate ? `Bắt đầu ${formatShortDate(goal.startDate)}.` : "Chưa có ngày bắt đầu."}{" "}
                        {goal.endDate ? `Kết thúc ${formatShortDate(goal.endDate)}.` : "Chưa có hạn cuối."}
                      </p>
                    </GoalInsightCard>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <GoalInsightCard title="KR trực tiếp">
                        <p className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{goal.directKrCount}</p>
                        <p className="mt-2 text-slate-600">
                          {goal.directKrRiskCount > 0
                            ? `${goal.directKrRiskCount} KR trực tiếp đang cần chú ý.`
                            : "Chưa có KR trực tiếp rủi ro."}
                        </p>
                      </GoalInsightCard>
                      <GoalInsightCard title="KR hỗ trợ">
                        <p className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{goal.supportKrCount}</p>
                        <p className="mt-2 text-slate-600">
                          {goal.supportKrRiskCount > 0
                            ? `${goal.supportKrRiskCount} KR hỗ trợ đang cần chú ý.`
                            : "Chưa có KR hỗ trợ rủi ro."}
                        </p>
                      </GoalInsightCard>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function KeyResultMetricCell({
  current,
  target,
  unit,
}: {
  current: number | null;
  target: number | null;
  unit: string | null;
}) {
  return (
    <div>
      <p className="font-medium text-slate-900">{formatDepartmentMetric(current, unit)}</p>
      <p className="mt-1 text-xs text-slate-500">Chỉ tiêu {formatDepartmentMetric(target, unit)}</p>
    </div>
  );
}

function DirectKeyResultsTable({ items }: { items: DepartmentDirectKeyResultItem[] }) {
  if (items.length === 0) {
    return <EmptyPanel text="Chưa có KR trực tiếp trong bộ lọc hiện tại." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1360px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400">
            <th className="px-4 py-3 font-semibold">KR</th>
            <th className="px-4 py-3 font-semibold">Mục tiêu cha</th>
            <th className="px-4 py-3 font-semibold">Hiện tại / Chỉ tiêu</th>
            <th className="px-4 py-3 font-semibold">Tiến độ</th>
            <th className="px-4 py-3 font-semibold">Nhịp đạt đích</th>
            <th className="px-4 py-3 font-semibold">Phòng ban phụ trách</th>
            <th className="px-4 py-3 font-semibold">KR hỗ trợ</th>
            <th className="px-4 py-3 font-semibold">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 align-top last:border-b-0">
              <td className="px-4 py-4">
                <Link
                  href={item.goalId ? `/goals/${item.goalId}/key-results/${item.id}` : "#"}
                  className="font-semibold text-slate-950 hover:text-blue-700"
                >
                  {item.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500">{item.typeLabel}</p>
              </td>
              <td className="px-4 py-4 text-slate-700">{item.goalName}</td>
              <td className="px-4 py-4">
                <KeyResultMetricCell current={item.current} target={item.target} unit={item.unit} />
              </td>
              <td className="px-4 py-4">
                <div className="min-w-[180px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900">{item.progress}%</span>
                    <span className="text-xs text-slate-500">{formatDaysRemaining(item.daysRemaining)}</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={item.progress} tone={getHealthTone(item.health)} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.riskNote}</p>
                </div>
              </td>
              <td className="px-4 py-4">
                <PaceAssessmentCell
                  paceLabel={item.paceLabel}
                  paceNote={item.paceNote}
                  scheduleGap={item.scheduleGap}
                />
              </td>
              <td className="px-4 py-4 text-slate-700">{item.responsibleDepartmentName}</td>
              <td className="px-4 py-4">
                {item.supportPreview.length > 0 ? (
                  <div className="flex max-w-[260px] flex-wrap gap-2">
                    {item.supportPreview.slice(0, 3).map((supportItem) => (
                      <span key={supportItem.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {supportItem.name}
                      </span>
                    ))}
                    {item.supportCount > 3 ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        +{item.supportCount - 3}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">Chưa có KR hỗ trợ liên kết</span>
                )}
              </td>
              <td className="px-4 py-4">
                <HealthBadge health={item.health} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupportKeyResultsTable({ items }: { items: DepartmentSupportKeyResultItem[] }) {
  if (items.length === 0) {
    return <EmptyPanel text="Chưa có KR hỗ trợ phù hợp trong bộ lọc hiện tại." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1480px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400">
            <th className="px-4 py-3 font-semibold">KR</th>
            <th className="px-4 py-3 font-semibold">Mục tiêu cha</th>
            <th className="px-4 py-3 font-semibold">Hiện tại / Chỉ tiêu</th>
            <th className="px-4 py-3 font-semibold">Tiến độ</th>
            <th className="px-4 py-3 font-semibold">Nhịp đạt đích</th>
            <th className="px-4 py-3 font-semibold">Phòng ban phụ trách</th>
            <th className="px-4 py-3 font-semibold">KR trực tiếp được hỗ trợ</th>
            <th className="px-4 py-3 font-semibold">Phân bổ</th>
            <th className="px-4 py-3 font-semibold">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 align-top last:border-b-0">
              <td className="px-4 py-4">
                <Link
                  href={item.goalId ? `/goals/${item.goalId}/key-results/${item.id}` : "#"}
                  className="font-semibold text-slate-950 hover:text-blue-700"
                >
                  {item.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500">{item.typeLabel}</p>
              </td>
              <td className="px-4 py-4 text-slate-700">{item.goalName}</td>
              <td className="px-4 py-4">
                <KeyResultMetricCell current={item.current} target={item.target} unit={item.unit} />
              </td>
              <td className="px-4 py-4">
                <div className="min-w-[180px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900">{item.progress}%</span>
                    <span className="text-xs text-slate-500">{formatDaysRemaining(item.daysRemaining)}</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={item.progress} tone={getHealthTone(item.health)} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.riskNote}</p>
                </div>
              </td>
              <td className="px-4 py-4">
                <PaceAssessmentCell
                  paceLabel={item.paceLabel}
                  paceNote={item.paceNote}
                  scheduleGap={item.scheduleGap}
                />
              </td>
              <td className="px-4 py-4 text-slate-700">{item.responsibleDepartmentName}</td>
              <td className="px-4 py-4">
                {item.supportedDirectKeyResults.length > 0 ? (
                  <div className="space-y-2">
                    {item.supportedDirectKeyResults.slice(0, 3).map((directItem) => (
                      <div key={`${item.id}-${directItem.id}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="font-medium text-slate-900">{directItem.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{directItem.goalName}</p>
                      </div>
                    ))}
                    {item.supportedDirectKeyResults.length > 3 ? (
                      <p className="text-xs text-slate-500">+{item.supportedDirectKeyResults.length - 3} KR trực tiếp khác</p>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">Chưa có KR trực tiếp được hỗ trợ</span>
                )}
              </td>
              <td className="px-4 py-4">
                {item.supportedDirectKeyResults.length > 0 ? (
                  <div className="space-y-2">
                    {item.supportedDirectKeyResults.slice(0, 3).map((directItem) => (
                      <div key={`${item.id}-${directItem.id}-allocation`} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                        {directItem.allocationLabel}
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">{item.allocationModeLabel}</p>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">Chưa có thông tin phân bổ</span>
                )}
              </td>
              <td className="px-4 py-4">
                <HealthBadge health={item.health} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DepartmentKeyResultsSection({
  directItems,
  supportItems,
  loading,
  error,
}: {
  directItems: DepartmentDirectKeyResultItem[];
  supportItems: DepartmentSupportKeyResultItem[];
  loading: boolean;
  error: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"direct" | "support">("direct");
  const [sortOption, setSortOption] = useState<ProgressSortOption>("attention");
  const helperText =
    activeTab === "direct"
      ? "Đây là các KR tạo ra kết quả chính của phòng ban và tác động trực tiếp đến hiệu suất chung."
      : "Đây là các KR giúp đẩy các KR trực tiếp đi lên, nhưng không được cộng thẳng vào chỉ tiêu chính.";
  const currentItems = activeTab === "direct" ? directItems : supportItems;
  const needsAttentionCount = useMemo(
    () => currentItems.filter((item) => isNeedsAttentionHealth(item.health)).length,
    [currentItems],
  );
  const sortedDirectItems = useMemo(() => {
    if (sortOption === "progress_asc") {
      return [...directItems].sort((a, b) => compareByProgress(a, b, "asc"));
    }
    if (sortOption === "progress_desc") {
      return [...directItems].sort((a, b) => compareByProgress(a, b, "desc"));
    }
    return directItems;
  }, [directItems, sortOption]);
  const sortedSupportItems = useMemo(() => {
    if (sortOption === "progress_asc") {
      return [...supportItems].sort((a, b) => compareByProgress(a, b, "asc"));
    }
    if (sortOption === "progress_desc") {
      return [...supportItems].sort((a, b) => compareByProgress(a, b, "desc"));
    }
    return supportItems;
  }, [sortOption, supportItems]);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <SectionHeading
        eyebrow="KR"
        title="Danh sách KR"
        description="Chia rõ KR trực tiếp và KR hỗ trợ để thấy phần nào đang tạo kết quả, phần nào đang hỗ trợ."
      />
      <div className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("direct")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                activeTab === "direct" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              KR trực tiếp
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("support")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                activeTab === "support" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              KR hỗ trợ
            </button>
          </div>
          <HelperNote>{helperText}</HelperNote>
        </div>
        <ProgressSortToolbar
          needsAttentionText={`${needsAttentionCount} KR cần chú ý`}
          totalText={`${currentItems.length} KR trong phạm vi`}
          sortOption={sortOption}
          onSortChange={setSortOption}
        />

        {loading || error ? (
          <BlockState loading={loading} error={error} emptyText="" />
        ) : activeTab === "direct" ? (
          <DirectKeyResultsTable items={sortedDirectItems} />
        ) : (
          <SupportKeyResultsTable items={sortedSupportItems} />
        )}
      </div>
    </article>
  );
}

function RiskColumn({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function RiskRow({
  title,
  meta,
  reason,
}: {
  title: string;
  meta: string;
  reason: string;
}) {
  return (
    <div className="rounded-2xl border border-white bg-white px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{meta}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{reason}</p>
    </div>
  );
}

export function DepartmentRisksSection({
  risks,
  loading,
  error,
}: {
  risks: {
    goals: DepartmentGoalPerformanceItem[];
    directKeyResults: DepartmentDirectKeyResultItem[];
    supportKeyResults: DepartmentSupportKeyResultItem[];
    upcomingDeadlines: DepartmentRiskDeadlineItem[];
  };
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <SectionHeading
        eyebrow="Rủi ro"
        title="Điểm nghẽn và cảnh báo ưu tiên"
        description="Chỉ giữ các tín hiệu rủi ro có thể hành động ngay: mục tiêu chậm nhất, KR yếu nhất và các mốc sắp đến hạn."
      />
      <div className="px-6 py-6">
        {loading || error ? (
          <BlockState loading={loading} error={error} emptyText="" />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            <RiskColumn title="Mục tiêu chậm nhất" description="Ưu tiên mục tiêu đang chậm hoặc có nhiều KR dưới ngưỡng an toàn.">
              {risks.goals.length > 0 ? (
                risks.goals.map((goal) => (
                  <RiskRow
                    key={goal.id}
                    title={goal.name}
                    meta={`${goal.progress}% · ${formatDateShortVi(goal.endDate)} · ${goal.typeLabel}`}
                    reason={goal.riskNote}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">Không có mục tiêu rủi ro nổi bật trong phạm vi hiện tại.</p>
              )}
            </RiskColumn>

            <RiskColumn title="KR trực tiếp dưới chỉ tiêu" description="Các KR trực tiếp này đang kéo thẳng hiệu suất kinh doanh đi xuống.">
              {risks.directKeyResults.length > 0 ? (
                risks.directKeyResults.map((item) => (
                  <RiskRow
                    key={item.id}
                    title={item.name}
                    meta={`${item.goalName} · ${item.progress}% · ${formatDaysRemaining(item.daysRemaining)}`}
                    reason={item.riskNote}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">Không có KR trực tiếp rủi ro trong bộ lọc hiện tại.</p>
              )}
            </RiskColumn>

            <RiskColumn title="KR hỗ trợ cần chú ý" description="Yếu ở đây chưa làm giảm KPI trực tiếp ngay, nhưng sẽ kéo chậm phần kết quả chính.">
              {risks.supportKeyResults.length > 0 ? (
                risks.supportKeyResults.map((item) => (
                  <RiskRow
                    key={item.id}
                    title={item.name}
                    meta={`${item.goalName} · ${item.progress}% · ${item.supportedDirectKeyResults.length} KR trực tiếp liên quan`}
                    reason={item.riskNote}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">Không có KR hỗ trợ cần chú ý trong phạm vi hiện tại.</p>
              )}
            </RiskColumn>

            <RiskColumn title="Mốc cần chú ý trong 7 ngày tới" description="Nhìn nhanh các mốc sắp đến hạn để xử lý trước khi trở thành chậm tiến độ.">
              {risks.upcomingDeadlines.length > 0 ? (
                risks.upcomingDeadlines.map((item) => (
                  <RiskRow
                    key={`${item.entityType}-${item.id}`}
                    title={item.name}
                    meta={`${item.entityType === "goal" ? "Mục tiêu" : item.parentName} · ${formatDateShortVi(item.endDate)} · ${formatDaysRemaining(item.daysRemaining)}`}
                    reason={item.reason}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">Không có mốc nổi bật trong 7 ngày tới.</p>
              )}
            </RiskColumn>
          </div>
        )}
      </div>
    </article>
  );
}

export function DepartmentMemberContributionSection({
  items,
  loading,
  error,
}: {
  items: DepartmentMemberContributionItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <SectionHeading
        eyebrow="Thành viên"
        title="Đóng góp thành viên"
      />
      <div className="px-6 py-6">
        {loading || error || items.length === 0 ? (
          <BlockState
            loading={loading}
            error={error}
            empty={items.length === 0}
            emptyText="Chưa có dữ liệu đóng góp thành viên trong phạm vi lọc."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400">
                  <th className="px-4 py-3 font-semibold">Thành viên</th>
                  <th className="px-4 py-3 font-semibold">Vai trò</th>
                  <th className="px-4 py-3 font-semibold">Mục tiêu</th>
                  <th className="px-4 py-3 font-semibold">KR</th>
                  <th className="px-4 py-3 font-semibold">Điểm đóng góp</th>
                  <th className="px-4 py-3 font-semibold">Tín hiệu cần chú ý</th>
                  <th className="px-4 py-3 font-semibold">Ngữ cảnh công việc</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
                          {item.name
                            .split(" ")
                            .map((part) => part[0] ?? "")
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <div className="mt-2">
                            <MemberStatusBadge status={item.status} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.roleName}</td>
                    <td className="px-4 py-4 font-medium text-slate-900">{item.goalsInvolved}</td>
                    <td className="px-4 py-4 font-medium text-slate-900">{item.keyResultsInvolved}</td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">
                        {item.performanceScore === null ? "Chưa có dữ liệu" : `${item.performanceScore}%`}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="max-w-[280px] leading-6 text-slate-600">{item.signalText}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">Quá hạn {item.overdueTasks}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">Bị chặn {item.blockedTasks}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </article>
  );
}

export function DepartmentExecutionContextSection({
  executionContext,
  loading,
  error,
}: {
  executionContext: {
    overdueTasks: number;
    blockedTasks: number;
    openTasks: number;
    items: DepartmentExecutionContextItem[];
  };
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white/90 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.55)]">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Ngữ cảnh thực thi</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Thông tin công việc hỗ trợ cho việc đọc KR</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Phần này nằm ở cuối trang và mặc định thu gọn. Công việc chỉ dùng để giải thích vì sao một KR đang chậm, không dùng làm tín hiệu hiệu suất chính.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {loading ? "Đang tải" : `${executionContext.overdueTasks} công việc quá hạn`}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {loading ? "Đang tải" : `${executionContext.blockedTasks} công việc bị chặn`}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {loading ? "Đang tải" : `${executionContext.openTasks} công việc đang mở`}
            </span>
            <CollapsibleTrigger className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {open ? "Ẩn chi tiết" : "Xem chi tiết"}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-slate-100 px-6 py-6">
            {loading || error || executionContext.items.length === 0 ? (
              <BlockState
                loading={loading}
                error={error}
                empty={executionContext.items.length === 0}
                emptyText="Không có ngữ cảnh thực thi nổi bật trong bộ lọc hiện tại."
              />
            ) : (
              <div className="space-y-3">
                {executionContext.items.map((item) => (
                  <div key={item.keyResultId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.keyResultName}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.goalName}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full bg-white px-3 py-1 font-medium">Quá hạn {item.overdueTasks}</span>
                        <span className="rounded-full bg-white px-3 py-1 font-medium">Bị chặn {item.blockedTasks}</span>
                        <span className="rounded-full bg-white px-3 py-1 font-medium">Đang mở {item.openTasks}</span>
                        <span className="rounded-full bg-white px-3 py-1 font-medium">Hoàn thành {item.completionRate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}
