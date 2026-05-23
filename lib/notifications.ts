"use client";

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  getTimeRequestDisplayLabel,
  isLeaveRequestSession,
  isLeaveRequestSubtype,
  type LeaveRequestSession,
  type LeaveRequestSubtype,
  type TimeRequestType,
} from "@/lib/constants/time-requests";
import { supabase } from "@/lib/supabase";

export type NotificationEntityType =
  | "goal"
  | "key_result"
  | "task"
  | "time_request"
  | "report"
  | "comment"
  | "system";

export type AppNotification = {
  id: string;
  recipientProfileId: string;
  actorProfileId: string | null;
  eventKey: string;
  entityType: NotificationEntityType;
  entityId: string;
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  recipient_profile_id: string | null;
  actor_profile_id: string | null;
  event_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  title: string | null;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean | null;
  read_at: string | null;
  created_at: string | null;
};

const NOTIFICATION_SELECT =
  "id,recipient_profile_id,actor_profile_id,event_key,entity_type,entity_id,title,body,href,metadata,is_read,read_at,created_at";

const toText = (value: unknown) => (typeof value === "string" ? value : "");

const toNullableText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

const isTimeRequestType = (value: unknown): value is TimeRequestType =>
  value === "approved_leave"
  || value === "unauthorized_leave"
  || value === "overtime"
  || value === "remote";

const getMetadataText = (
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
) => {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const extractTimeRequestTypeFromBody = (body: string | null) => {
  if (!body) {
    return null;
  }

  const matched = body.match(/(?:Loại|Loai)\s*:\s*([a-z_]+)\s*(?:,|$)/i);
  const rawType = matched?.[1]?.trim() ?? null;
  return isTimeRequestType(rawType) ? rawType : null;
};

const formatTimeRequestNotificationBody = (
  body: string | null,
  metadata: Record<string, unknown> | null | undefined,
) => {
  if (!body) {
    return null;
  }

  const metadataType = getMetadataText(metadata, ["type", "request_type", "time_request_type"]);
  const rawType = isTimeRequestType(metadataType)
    ? metadataType
    : extractTimeRequestTypeFromBody(body);

  if (!rawType) {
    return body;
  }

  const rawLeaveSubtype = getMetadataText(metadata, ["leave_subtype", "subtype"]);
  const rawLeaveSession = getMetadataText(metadata, ["leave_session", "session"]);
  const leaveSubtype: LeaveRequestSubtype | null = isLeaveRequestSubtype(rawLeaveSubtype)
    ? rawLeaveSubtype
    : null;
  const leaveSession: LeaveRequestSession | null = isLeaveRequestSession(rawLeaveSession)
    ? rawLeaveSession
    : null;

  const label = getTimeRequestDisplayLabel(rawType, {
    leaveSubtype,
    leaveSession,
  });

  return body.replace(/((?:Loại|Loai)\s*:\s*)([a-z_]+)(\s*(?:,|$))/i, `$1${label}$3`);
};

export const normalizeNotificationRow = (row: NotificationRow): AppNotification => ({
  id: String(row.id),
  recipientProfileId: String(row.recipient_profile_id ?? ""),
  actorProfileId: row.actor_profile_id ? String(row.actor_profile_id) : null,
  eventKey: toText(row.event_key),
  entityType: (toText(row.entity_type) || "system") as NotificationEntityType,
  entityId: toText(row.entity_id),
  title: toText(row.title) || "Thông báo",
  body:
    (toText(row.entity_type) || "system") === "time_request"
      ? formatTimeRequestNotificationBody(
          toNullableText(row.body),
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? row.metadata
            : {},
        )
      : toNullableText(row.body),
  href: toNullableText(row.href),
  metadata:
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {},
  isRead: Boolean(row.is_read),
  readAt: row.read_at ? String(row.read_at) : null,
  createdAt: toText(row.created_at) || new Date(0).toISOString(),
});

export async function fetchNotifications(limit = 20) {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Không thể tải thông báo.");
  }

  return ((data ?? []) as NotificationRow[]).map(normalizeNotificationRow);
}

export async function fetchUnreadNotificationCount() {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) {
    throw new Error(error.message || "Không thể tải số lượng thông báo chưa đọc.");
  }

  return count ?? 0;
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) {
    throw new Error(error.message || "Không thể đánh dấu thông báo đã đọc.");
  }
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    throw new Error(error.message || "Không thể đánh dấu tất cả thông báo đã đọc.");
  }
}

type SubscribeToNotificationsHandlers = {
  onChange?: () => void;
  onInsert?: (notification: AppNotification) => void;
  onUpdate?: (notification: AppNotification) => void;
};

let notificationChannelSequence = 0;

export function subscribeToNotifications(
  recipientProfileId: string,
  handlers: SubscribeToNotificationsHandlers | (() => void),
): RealtimeChannel {
  const normalizedHandlers: SubscribeToNotificationsHandlers =
    typeof handlers === "function" ? { onChange: handlers } : handlers;
  notificationChannelSequence += 1;

  return supabase
    .channel(`notifications:${recipientProfileId}:${notificationChannelSequence}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_profile_id=eq.${recipientProfileId}`,
      },
      (payload: RealtimePostgresChangesPayload<NotificationRow>) => {
        normalizedHandlers.onChange?.();

        if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") {
          return;
        }

        const nextRecord = payload.new;
        if (!nextRecord || typeof nextRecord !== "object") {
          return;
        }

        const notification = normalizeNotificationRow(nextRecord as NotificationRow);

        if (payload.eventType === "INSERT") {
          normalizedHandlers.onInsert?.(notification);
          return;
        }

        if (payload.eventType === "UPDATE") {
          normalizedHandlers.onUpdate?.(notification);
        }
      },
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Notification realtime subscription failed.", {
          recipientProfileId,
          error,
        });
      }
    });
}
