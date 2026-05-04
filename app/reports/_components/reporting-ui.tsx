"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  type PerformanceReportItemRow,
  type PerformanceReportItemType,
  formatReportCount,
  formatReportDateRange,
  formatReportItemTypeLabel,
  formatReportScore,
  formatReportStatusLabel,
  getReportStatusTone,
} from "@/lib/performance-reports";

const formatScoreText = (value: number | null | undefined, emptyText = "Chưa có điểm") => {
  const formatted = formatReportScore(value);
  return formatted === "--" ? emptyText : formatted;
};

const formatCountText = (value: number | null | undefined, emptyText = "Chưa có dữ liệu") => {
  const formatted = formatReportCount(value);
  return formatted === "--" ? emptyText : formatted;
};

function ProgressBar({
  value,
  tone = "blue",
}: {
  value: number | null | undefined;
  tone?: "blue" | "emerald" | "amber" | "rose";
}) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, Number(value))) : 0;
  const toneClassName =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "rose"
          ? "bg-rose-500"
          : "bg-blue-600";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn("h-full rounded-full", toneClassName)}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

export function ReportStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
        getReportStatusTone(status),
      )}
    >
      {formatReportStatusLabel(status)}
    </span>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-700">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function BlockState({
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
    return <div className="px-5 py-10 text-sm text-slate-700">Đang tải dữ liệu...</div>;
  }
  if (error) {
    return <div className="px-5 py-10 text-sm text-rose-600">{error}</div>;
  }
  if (empty) {
    return <div className="px-5 py-10 text-sm text-slate-700">{emptyText}</div>;
  }
  return null;
}

export function ScoreCard({
  title,
  value,
  note,
  tone = "blue",
}: {
  title: string;
  value: number | null | undefined;
  note?: string;
  tone?: "blue" | "emerald" | "amber" | "rose";
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
        {formatScoreText(value)}
      </p>
      {value !== null && value !== undefined ? (
        <div className="mt-4">
          <ProgressBar value={value} tone={tone} />
        </div>
      ) : null}
      {note ? <p className="mt-3 text-sm text-slate-700">{note}</p> : null}
    </article>
  );
}

export function CompactMetricCard({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">
        {formatCountText(value, "Chưa có")}
      </p>
    </div>
  );
}

function SummaryMetricCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </article>
  );
}

function normalizeMetricType(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function isRevenueToken(token: string) {
  return token.includes("doanh thu") || token.includes("revenue");
}

function isPercentToken(token: string) {
  return token.includes("phan tram") || token.includes("percent") || token === "%";
}

function isQuantityToken(token: string) {
  return (
    token.includes("so luong") ||
    token.includes("quantity") ||
    token.includes("count") ||
    token === "sl"
  );
}

function resolveMappedUnit(item: PerformanceReportItemRow) {
  const metricTypeFromMeta =
    item.meta_json && typeof item.meta_json.metric_type === "string"
      ? item.meta_json.metric_type
      : null;
  const taskTypeFromMeta =
    item.meta_json && typeof item.meta_json.task_type === "string"
      ? item.meta_json.task_type
      : null;
  const normalizedTokens = [metricTypeFromMeta, taskTypeFromMeta, item.unit]
    .map((value) => normalizeMetricType(value))
    .filter(Boolean);

  if (normalizedTokens.some(isRevenueToken)) {
    return "đ";
  }
  if (normalizedTokens.some(isPercentToken)) {
    return "%";
  }
  if (normalizedTokens.some(isQuantityToken)) {
    return "";
  }

  return item.unit ?? "";
}

function formatValueWithUnit(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const rendered = new Intl.NumberFormat("vi-VN").format(Number(value));
  return unit ? `${rendered} ${unit}` : rendered;
}

function formatPriorityVi(value: string | null | undefined) {
  const token = normalizeMetricType(value);

  if (!token) {
    return "--";
  }
  if (token === "critical" || token === "urgent") {
    return "Khẩn cấp";
  }
  if (token === "high") {
    return "Cao";
  }
  if (token === "medium" || token === "normal") {
    return "Trung bình";
  }
  if (token === "low") {
    return "Thấp";
  }

  return value?.trim() || "--";
}

function ReportItemRow({ item }: { item: PerformanceReportItemRow }) {
  const href =
    item.meta_json && typeof item.meta_json.href === "string" ? item.meta_json.href : null;
  const unit = resolveMappedUnit(item);
  const progressText = formatScoreText(item.progress_percent, "Chưa có");
  const currentTargetText = `${formatValueWithUnit(item.current_value, unit)} / ${formatValueWithUnit(item.target_value, unit)}`;
  const priorityFromMeta =
    item.meta_json && typeof item.meta_json.priority === "string" && item.meta_json.priority.trim()
      ? formatPriorityVi(item.meta_json.priority)
      : "--";

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
        {href ? (
          <Link href={href} className="transition hover:text-blue-700">
            {item.name}
          </Link>
        ) : (
          item.name
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{progressText}</p>
        <p className="mt-1 text-xs text-slate-600">{currentTargetText}</p>
      </td>
      {item.item_type === "execution" ? (
        <td className="px-4 py-3 text-sm text-slate-700">{priorityFromMeta}</td>
      ) : null}
    </tr>
  );
}

export function ReportItemGroup({
  itemType,
  items,
}: {
  itemType: PerformanceReportItemType;
  items: PerformanceReportItemRow[];
}) {
  const isTaskGroup = itemType === "execution";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {formatReportItemTypeLabel(itemType)}
          </h3>
          {/* <p className="mt-1 text-sm text-slate-700">{getReportItemGroupDescription(itemType)}</p> */}
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          {items.length} mục
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items.length > 0 ? (
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="bg-slate-50 text-xs tracking-[0.08em] text-slate-500 uppercase">
                <th className="px-4 py-3 font-semibold">Tên</th>
                <th className="px-4 py-3 font-semibold">Tiến độ</th>
                {isTaskGroup ? <th className="px-4 py-3 font-semibold">Độ ưu tiên</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ReportItemRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-700">
            Nhóm này chưa có dữ liệu. Báo cáo có thể mới được tạo hoặc chưa có dữ liệu tổng hợp cho
            kỳ này.
          </div>
        )}
      </div>
    </div>
  );
}

export function ReportTopSummary({
  employeeName,
  departmentName,
  periodStart,
  periodEnd,
  status,
  goalProgressText,
  krProgressText,
  taskCompletionText,
  taskPointText,
}: {
  employeeName: string;
  departmentName: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: string;
  goalProgressText: string;
  krProgressText: string;
  taskCompletionText: string;
  taskPointText: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Nhân sự</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-950">
            {employeeName}
          </h1>
          <p className="mt-2 text-sm text-slate-700">{departmentName}</p>
          <p className="mt-1 text-sm text-slate-700">
            {formatReportDateRange(periodStart, periodEnd)}
          </p>
        </div>
        <ReportStatusBadge status={status} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <SummaryMetricCard title="Tiến độ Goal trung bình" value={goalProgressText} />
        <SummaryMetricCard title="Tiến độ KR trung bình" value={krProgressText} />
        <SummaryMetricCard title="Task hoàn thành" value={taskCompletionText} />
        <SummaryMetricCard title="Điểm task" value={taskPointText} />
      </div>
    </section>
  );
}
