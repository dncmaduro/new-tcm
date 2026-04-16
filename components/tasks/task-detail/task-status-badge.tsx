import { cn } from "@/lib/utils";
import { getTaskStatusMeta } from "./utils";

type TaskStatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  const meta = getTaskStatusMeta(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset",
        meta.badgeClassName,
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}
