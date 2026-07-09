"use client";

import { type ComponentProps, type ReactNode } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { cn } from "@/lib/utils";

type BreadcrumbItem = NonNullable<ComponentProps<typeof WorkspacePageHeader>["items"]>[number];

export function DetailPageHeader({ title, items }: { title: string; items: BreadcrumbItem[] }) {
  return <WorkspacePageHeader title={title} items={items} />;
}

export function ActionGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

export function DetailOverviewCard({
  badges,
  title,
  actions,
  metrics,
  children,
  className,
}: {
  badges?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  metrics?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("rounded-2xl border border-slate-200 bg-white p-4 lg:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {badges ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">{badges}</div>
          ) : null}
          <div className={cn(badges ? "mt-2" : "", "min-w-0")}>
            {typeof title === "string" ? (
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 lg:text-[28px]">
                {title}
              </h1>
            ) : (
              title
            )}
          </div>
        </div>
        {actions}
      </div>

      {metrics ? <div className="mt-4">{metrics}</div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  children,
  className,
  valueClassName,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      {value !== undefined ? (
        <div className={cn("mt-1.5 text-base font-semibold text-slate-900", valueClassName)}>
          {value}
        </div>
      ) : null}
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <article className={cn("rounded-2xl border border-slate-200 bg-white p-4 lg:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      <div className={cn("mt-4", bodyClassName)}>{children}</div>
    </article>
  );
}

export function EmptyStateCompact({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DetailSidebar({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn("self-start xl:sticky", className)}>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <div className="mt-4 space-y-3 text-sm">{children}</div>
      </article>
    </aside>
  );
}

export function DetailInfoRow({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 text-sm", className)}>
      <span className="text-slate-500">{label}</span>
      <div className={cn("max-w-[65%] text-right font-medium text-slate-800", valueClassName)}>
        {value}
      </div>
    </div>
  );
}
