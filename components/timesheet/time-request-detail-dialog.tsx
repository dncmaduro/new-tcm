"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TimeRequestDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: {
    id: string;
    typeLabel: string;
    requestDateLabel: string;
    correctionDateLabel: string;
    statusLabel: string;
    statusClassName: string;
    durationLabel: string;
    reason: string;
    requesterName?: string | null;
    leaveDetailLabel?: string | null;
    remoteTimeLabel?: string | null;
    holidayLabel?: string | null;
  } | null;
  footerActions?: ReactNode;
};

export function TimeRequestDetailDialog({
  open,
  onOpenChange,
  request,
  footerActions = null,
}: TimeRequestDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <DialogTitle>Chi tiết yêu cầu thời gian</DialogTitle>
              <DialogDescription>
                {request?.requesterName?.trim()
                  ? `${request.requesterName} · ${request?.correctionDateLabel ?? "--"}`
                  : `Ngày cần sửa: ${request?.correctionDateLabel ?? "--"}`}
              </DialogDescription>
            </div>
            {request?.statusLabel ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${request.statusClassName}`}
              >
                {request.statusLabel}
              </span>
            ) : null}
          </div>
        </DialogHeader>

        {request ? (
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Loại yêu cầu</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{request.typeLabel}</p>
                {request.leaveDetailLabel ? (
                  <p className="mt-1 text-xs text-slate-500">{request.leaveDetailLabel}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Thời lượng</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{request.durationLabel}</p>
                {request.remoteTimeLabel ? (
                  <p className="mt-1 text-xs text-indigo-600">{request.remoteTimeLabel}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Ngày gửi</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{request.requestDateLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Ngày cần sửa</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{request.correctionDateLabel}</p>
                {request.holidayLabel ? (
                  <p className="mt-1 text-xs text-emerald-700">{request.holidayLabel}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">Lý do</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.reason}</p>
            </div>

            {footerActions ? <div className="border-t border-slate-100 pt-5">{footerActions}</div> : null}
          </div>
        ) : (
          <div className="px-6 py-8 text-sm text-slate-500">Không tìm thấy yêu cầu.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
