"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getActivityActionKind,
  getActivityActionLabel,
  getActivityVisibleChanges,
  type ActivityActionKind,
  type ActivityEntityType,
} from "@/lib/activity-log";
import { formatDateTimeDdMmYyyy } from "@/lib/date-format";
import { supabase } from "@/lib/supabase";

type ActivityLogRow = {
  id: string;
  profile_id: string | null;
  action: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string | null;
};

type ActivityLogItem = {
  id: string;
  actorName: string;
  actionLabel: string;
  actionKind: ActivityActionKind;
  createdAt: string | null;
  changes: Array<{
    field: string;
    label: string;
    oldText: string;
    newText: string;
  }>;
};

type ActivityHistoryDialogProps = {
  entityType: ActivityEntityType;
  entityId: string | null;
  title: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

const formatDateTime = (value: string | null) => {
  return formatDateTimeDdMmYyyy(value, "Chưa có", "Không hợp lệ");
};

export function ActivityHistoryDialog({
  entityType,
  entityId,
  title,
  triggerLabel = "Lịch sử hoạt động",
  triggerClassName,
}: ActivityHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  useEffect(() => {
    if (!open || !entityId) {
      return;
    }

    let isActive = true;

    const loadLogs = async () => {
      setIsLoading(true);
      setError(null);

      const { data: logsData, error: logsError } = await supabase
        .from("activity_logs")
        .select("id,profile_id,action,old_value,new_value,created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!isActive) {
        return;
      }

      if (logsError) {
        setLogs([]);
        setError("Không tải được lịch sử hoạt động.");
        setIsLoading(false);
        return;
      }

      const typedLogs = (logsData ?? []) as ActivityLogRow[];
      const profileIds = [
        ...new Set(
          typedLogs
            .map((item) => item.profile_id)
            .filter(Boolean)
            .map((item) => String(item)),
        ),
      ];

      let profileNameById: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id,name")
          .in("id", profileIds);

        if (!isActive) {
          return;
        }

        profileNameById = (profilesData ?? []).reduce<Record<string, string>>((acc, item) => {
          const id = String(item.id);
          acc[id] = item.name ? String(item.name) : "Không rõ";
          return acc;
        }, {});
      }

      const mappedLogs: ActivityLogItem[] = typedLogs.map((item) => {
        const changes = getActivityVisibleChanges({
          action: item.action,
          entityType,
          oldValue: item.old_value && typeof item.old_value === "object" && !Array.isArray(item.old_value)
            ? (item.old_value as Record<string, unknown>)
            : null,
          newValue: item.new_value && typeof item.new_value === "object" && !Array.isArray(item.new_value)
            ? (item.new_value as Record<string, unknown>)
            : null,
        });
        const actorName =
          item.profile_id ? (profileNameById[String(item.profile_id)] ?? "Không rõ") : "Hệ thống";

        return {
          id: String(item.id),
          actorName,
          actionKind: getActivityActionKind(item.action),
          actionLabel: getActivityActionLabel(item.action, entityType),
          createdAt: item.created_at,
          changes,
        };
      });

      setLogs(mappedLogs);
      setIsLoading(false);
    };

    void loadLogs();

    return () => {
      isActive = false;
    };
  }, [entityId, entityType, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!entityId}
          className={
            triggerClassName ??
            "inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          }
        >
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200">
          {isLoading ? (
            <div className="px-4 py-5 text-sm text-slate-600">Đang tải lịch sử hoạt động...</div>
          ) : null}

          {!isLoading && error ? (
            <div className="px-4 py-5 text-sm text-rose-700">{error}</div>
          ) : null}

          {!isLoading && !error && logs.length === 0 ? (
            <div className="px-4 py-5 text-sm text-slate-600">Chưa có lịch sử hoạt động.</div>
          ) : null}

          {!isLoading && !error && logs.length > 0 ? (
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Thời gian</th>
                  <th className="px-4 py-3 font-semibold">Người thực hiện</th>
                  <th className="px-4 py-3 font-semibold">Hành động</th>
                  <th className="px-4 py-3 font-semibold">Giá trị cũ</th>
                  <th className="px-4 py-3 font-semibold">Giá trị mới</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {log.actorName}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {log.actionLabel}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.actionKind === "created" ? (
                        <p className="text-slate-400">Không có dữ liệu trước đó.</p>
                      ) : log.changes.length === 0 ? (
                        <p className="text-slate-400">Không có thay đổi chi tiết.</p>
                      ) : (
                        <div className="space-y-2">
                          {log.changes.map((change) => (
                            <div key={`${log.id}-${change.field}-old`}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                                {change.label}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                                {change.oldText}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.actionKind === "deleted" ? (
                        <p className="text-slate-400">Không còn dữ liệu sau khi xóa.</p>
                      ) : log.changes.length === 0 ? (
                        <p className="text-slate-400">Không có thay đổi chi tiết.</p>
                      ) : (
                        <div className="space-y-2">
                          {log.changes.map((change) => (
                            <div key={`${log.id}-${change.field}-new`}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                                {change.label}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                                {change.newText}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
