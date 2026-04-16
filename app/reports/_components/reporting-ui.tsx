"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  type PerformanceReportItemRow,
  type PerformanceReportItemType,
  formatReportCount,
  formatReportDateRange,
  formatReportItemTypeLabel,
  formatReportNumericValue,
  formatReportScore,
  formatReportStatusLabel,
  getReportItemGroupDescription,
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

const formatMetricText = (
  value: number | null | undefined,
  unit: string | null | undefined,
  emptyText = "Chưa có dữ liệu",
) => {
  const formatted = formatReportNumericValue(value, unit);
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
      <div className={cn("h-full rounded-full", toneClassName)} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export function ReportStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", getReportStatusTone(status))}>
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
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
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
    return <div className="px-5 py-10 text-sm text-slate-500">Đang tải dữ liệu...</div>;
  }
  if (error) {
    return <div className="px-5 py-10 text-sm text-rose-600">{error}</div>;
  }
  if (empty) {
    return <div className="px-5 py-10 text-sm text-slate-500">{emptyText}</div>;
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
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{title}</p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{formatScoreText(value)}</p>
      {value !== null && value !== undefined ? (
        <div className="mt-4">
          <ProgressBar value={value} tone={tone} />
        </div>
      ) : null}
      {note ? <p className="mt-3 text-sm text-slate-500">{note}</p> : null}
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
      <p className="text-xs uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{formatCountText(value, "Chưa có")}</p>
    </div>
  );
}

function renderMetaValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function MetaJsonViewer({
  meta,
}: {
  meta: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const primitiveEntries = Object.entries(meta).filter(([, value]) => {
    return value === null || ["string", "number", "boolean"].includes(typeof value);
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Ngữ cảnh bổ sung</p>
          <p className="mt-1 text-xs text-slate-500">
            {primitiveEntries.length > 0
              ? `${primitiveEntries.length} trường có thể xem nhanh`
              : "Mở rộng để xem dữ liệu chi tiết"}
          </p>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {open ? "Ẩn" : "Xem"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="space-y-4 border-t border-slate-200 px-4 py-4">
          {primitiveEntries.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {primitiveEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-400">{key}</p>
                  <p className="mt-1 text-sm text-slate-800">{renderMetaValue(value)}</p>
                </div>
              ))}
            </div>
          ) : null}

          <pre className="overflow-x-auto rounded-lg border border-white bg-white p-3 text-xs text-slate-700">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ReportItemCard({ item }: { item: PerformanceReportItemRow }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-lg font-semibold text-slate-900">{item.name}</p>
          <p className="mt-1 text-xs text-slate-500">{formatReportItemTypeLabel(item.item_type)}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          Điểm {formatScoreText(item.score)}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_repeat(5,minmax(0,1fr))]">
        <div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Tiến độ</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{formatScoreText(item.progress_percent, "Chưa có")}</p>
            </div>
            <p className="text-xs text-slate-500">Trọng số {formatCountText(item.weight, "Chưa có")}</p>
          </div>
          <div className="mt-3">
            <ProgressBar value={item.progress_percent} tone={item.score !== null && item.score < 50 ? "rose" : "blue"} />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Chỉ tiêu</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatMetricText(item.target_value, item.unit)}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Hiện tại</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatMetricText(item.current_value, item.unit)}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Đơn vị</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{item.unit || "Chưa có"}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Trọng số</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{formatCountText(item.weight, "Chưa có")}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Mã tham chiếu</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{item.reference_id || "Chưa có"}</p>
        </div>
      </div>

      {item.meta_json ? <MetaJsonViewer meta={item.meta_json} /> : null}
    </div>
  );
}

export function ReportItemGroup({
  itemType,
  items,
}: {
  itemType: PerformanceReportItemType;
  items: PerformanceReportItemRow[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{formatReportItemTypeLabel(itemType)}</h3>
          <p className="mt-1 text-sm text-slate-500">{getReportItemGroupDescription(itemType)}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          {items.length} mục
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {items.length > 0 ? (
          items.map((item) => <ReportItemCard key={item.id} item={item} />)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Nhóm này chưa có dữ liệu. Báo cáo có thể mới được tạo hoặc chưa có dữ liệu tổng hợp cho kỳ này.
          </div>
        )}
      </div>
    </div>
  );
}

export function ReportTopSummary({
  employeeName,
  departmentName,
  periodTypeLabel,
  periodKey,
  periodStart,
  periodEnd,
  status,
  overallScore,
  businessScore,
  supportScore,
  executionScore,
}: {
  employeeName: string;
  departmentName: string;
  periodTypeLabel: string;
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: string;
  overallScore: number | null;
  businessScore: number | null;
  supportScore: number | null;
  executionScore: number | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Nhân sự</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-950">{employeeName}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {departmentName} · {periodTypeLabel} · {periodKey}
          </p>
          <p className="mt-1 text-sm text-slate-500">{formatReportDateRange(periodStart, periodEnd)}</p>
        </div>
        <ReportStatusBadge status={status} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <ScoreCard title="Điểm tổng hợp" value={overallScore} note="Phản ánh tổng quan hiệu suất của kỳ báo cáo." />
        <ScoreCard title="Điểm kinh doanh" value={businessScore} tone="emerald" note="Tính từ mục tiêu và các KR trực tiếp." />
        <ScoreCard title="Điểm hỗ trợ" value={supportScore} tone="amber" note="Tính từ các KR hỗ trợ." />
        <ScoreCard title="Điểm thực thi" value={executionScore} tone="rose" note="Tổng hợp từ tiến độ công việc trong kỳ." />
      </div>
    </section>
  );
}
