import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatItemProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
  valueClassName?: string;
};

export function StatItem({
  label,
  value,
  hint,
  compact = false,
  className,
  valueClassName,
}: StatItemProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-slate-50",
        compact ? "px-3 py-3" : "px-4 py-4",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div
        className={cn(
          "mt-2 text-sm font-semibold text-slate-900",
          compact ? "text-sm" : "text-base",
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs leading-5 text-slate-500">{hint}</div> : null}
    </div>
  );
}
