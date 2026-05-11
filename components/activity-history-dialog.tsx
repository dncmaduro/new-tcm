"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  createdAt: string | null;
  oldValue: unknown;
  newValue: unknown;
};

type ActivityEntityType = "goal" | "key_result" | "task";

type ActivityHistoryDialogProps = {
  entityType: ActivityEntityType;
  entityId: string | null;
  title: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

const actionLabelMap: Record<string, string> = {
  goal_created: "Tạo mục tiêu",
  goal_updated: "Cập nhật mục tiêu",
  goal_status_changed: "Đổi trạng thái mục tiêu",
  goal_progress_updated: "Cập nhật tiến độ mục tiêu",
  goal_deleted: "Xóa mục tiêu",
  key_result_created: "Tạo KR",
  key_result_updated: "Cập nhật KR",
  key_result_status_changed: "Đổi trạng thái KR",
  key_result_progress_updated: "Cập nhật tiến độ KR",
  key_result_deleted: "Xóa KR",
  task_created: "Tạo công việc",
  task_updated: "Cập nhật công việc",
  task_status_changed: "Đổi trạng thái công việc",
  task_progress_updated: "Cập nhật tiến độ công việc",
  task_deleted: "Xóa công việc",
};

const formatActionLabel = (action: string | null) => {
  if (!action) {
    return "Cập nhật";
  }

  if (actionLabelMap[action]) {
    return actionLabelMap[action];
  }

  return action;
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "Không có";
  }

  if (typeof value === "string") {
    return value || "Không có";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Không đọc được dữ liệu";
  }
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

      const mappedLogs: ActivityLogItem[] = typedLogs.map((item) => ({
        id: String(item.id),
        actorName: item.profile_id
          ? (profileNameById[String(item.profile_id)] ?? "Không rõ")
          : "Hệ thống",
        actionLabel: formatActionLabel(item.action),
        createdAt: item.created_at,
        oldValue: item.old_value,
        newValue: item.new_value,
      }));

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
                    <td className="px-4 py-3 text-sm text-slate-700">{log.actionLabel}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <pre className="max-w-[260px] overflow-x-auto whitespace-pre-wrap break-words font-mono">
                        {formatValue(log.oldValue)}
                      </pre>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <pre className="max-w-[260px] overflow-x-auto whitespace-pre-wrap break-words font-mono">
                        {formatValue(log.newValue)}
                      </pre>
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
