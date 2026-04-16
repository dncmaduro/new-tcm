import { cn } from "@/lib/utils";
import type { ProgressTone } from "./types";
import { clampProgress } from "./utils";

const toneClassMap: Record<
  ProgressTone,
  {
    badgeClassName: string;
    barClassName: string;
    numberClassName: string;
  }
> = {
  slate: {
    badgeClassName: "bg-slate-100 text-slate-700",
    barClassName: "bg-slate-500",
    numberClassName: "text-slate-950",
  },
  blue: {
    badgeClassName: "bg-blue-50 text-blue-700",
    barClassName: "bg-blue-600",
    numberClassName: "text-slate-950",
  },
  emerald: {
    badgeClassName: "bg-emerald-50 text-emerald-700",
    barClassName: "bg-emerald-600",
    numberClassName: "text-slate-950",
  },
  rose: {
    badgeClassName: "bg-rose-50 text-rose-700",
    barClassName: "bg-rose-600",
    numberClassName: "text-slate-950",
  },
};

type ProgressSummaryProps = {
  progress: number;
  label?: string;
  statusLabel?: string;
  helper?: string;
  tone?: ProgressTone;
  variant?: "default" | "compact" | "hero";
  className?: string;
};

export function ProgressSummary({
  progress,
  label = "Tiến độ",
  statusLabel,
  helper,
  tone = "blue",
  variant = "default",
  className,
}: ProgressSummaryProps) {
  const normalizedProgress = clampProgress(progress);
  const toneClassName = toneClassMap[tone];
  const isCompact = variant === "compact";
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "rounded-2xl bg-slate-50",
        isCompact ? "px-3 py-3" : "px-4 py-4",
        isHero && "border border-slate-200 bg-slate-50/80 px-5 py-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          {statusLabel ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                toneClassName.badgeClassName,
              )}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "font-semibold tracking-[-0.03em]",
            toneClassName.numberClassName,
            isCompact ? "text-xl" : isHero ? "text-4xl" : "text-3xl",
          )}
        >
          {normalizedProgress}%
        </span>
      </div>

      <div className={cn("mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200", isCompact && "mt-3")}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-200", toneClassName.barClassName)}
          style={{ width: `${normalizedProgress}%` }}
        />
      </div>

      {helper ? <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}
