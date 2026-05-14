"use client";

import type { TaskEvidence } from "./types";

const evidenceTypeLabelMap: Record<TaskEvidence["evidence_type"], string> = {
  link: "Link",
  file: "Tệp",
  other: "Khác",
};

type TaskEvidenceItemProps = {
  evidence: TaskEvidence;
  isDeleting: boolean;
  isOpeningFile: boolean;
  primaryActionLabel: string | null;
  onOpenLink: (url: string) => void;
  onOpenFile: (evidence: TaskEvidence) => void;
  onDelete: (evidence: TaskEvidence) => void;
  formatDateTime: (value: string | null) => string;
};

export function TaskEvidenceItem({
  evidence,
  isDeleting,
  isOpeningFile,
  primaryActionLabel,
  onOpenLink,
  onOpenFile,
  onDelete,
  formatDateTime,
}: TaskEvidenceItemProps) {
  return (
    <tr className="border-b border-slate-100 align-top hover:bg-slate-50/70 last:border-b-0">
      <td className="px-4 py-3">
        <p className="max-w-[260px] truncate text-sm font-medium text-slate-900">{evidence.title}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        {evidenceTypeLabelMap[evidence.evidence_type]}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        {evidence.creator?.name?.trim() || "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">
        {formatDateTime(evidence.created_at)}
      </td>
      <td className="px-4 py-3">
        {evidence.description?.trim() ? (
          <p
            className="max-w-[280px] text-sm text-slate-600"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {evidence.description}
          </p>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {evidence.evidence_type === "link" && evidence.url ? (
            <button
              type="button"
              onClick={() => onOpenLink(evidence.url)}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Mở link
            </button>
          ) : null}
          {evidence.evidence_type === "file" && evidence.file_path && primaryActionLabel ? (
            <button
              type="button"
              onClick={() => onOpenFile(evidence)}
              disabled={isOpeningFile}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpeningFile ? "Đang mở..." : primaryActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(evidence)}
            disabled={isDeleting}
            className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? "Đang xóa..." : "Xóa"}
          </button>
        </div>
      </td>
    </tr>
  );
}
