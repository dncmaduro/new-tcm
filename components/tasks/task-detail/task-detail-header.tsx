import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProgressSummary } from "./progress-summary";
import type { TaskDetailBreadcrumb, TaskHeaderAction } from "./types";

type TaskDetailHeaderProps = {
  breadcrumbs: TaskDetailBreadcrumb[];
  title: string;
  progress: number;
  assigneeName: string;
  taskTypeLabel: string;
  timelineLabel: string;
  modeLabel?: string | null;
  primaryAction?: TaskHeaderAction;
  secondaryAction?: TaskHeaderAction;
};

export function TaskDetailHeader({
  breadcrumbs,
  title,
  progress,
  assigneeName,
  taskTypeLabel,
  timelineLabel,
  modeLabel,
  primaryAction,
  secondaryAction,
}: TaskDetailHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f3f5fa]/95 backdrop-blur">
      <div className="px-4 py-4 lg:px-7">
        <div className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.55)] lg:px-6 lg:py-6">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
                {item.href ? (
                  <Link href={item.href} className="transition-colors hover:text-slate-800">
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-700">{item.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? <span className="text-slate-300">/</span> : null}
              </span>
            ))}
          </nav>

          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                  {taskTypeLabel}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                  {assigneeName}
                </span>
                {modeLabel ? (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
                    {modeLabel}
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.15rem]">
                {title}
              </h1>
              <p className="mt-3 text-sm text-slate-500">{timelineLabel}</p>
            </div>

            <div className="space-y-3">
              <ProgressSummary progress={progress} label="Tiến độ task" variant="hero" />

              {(secondaryAction || primaryAction) ? (
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {secondaryAction ? (
                    <Button
                      variant={secondaryAction.variant ?? "outline"}
                      onClick={secondaryAction.onClick}
                      disabled={secondaryAction.disabled}
                      className={cn("min-w-[112px]", secondaryAction.loading && "pointer-events-none")}
                    >
                      {secondaryAction.label}
                    </Button>
                  ) : null}

                  {primaryAction ? (
                    <Button
                      variant={primaryAction.variant ?? "default"}
                      onClick={primaryAction.onClick}
                      disabled={primaryAction.disabled}
                      className={cn("min-w-[160px]", primaryAction.loading && "pointer-events-none")}
                    >
                      {primaryAction.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
