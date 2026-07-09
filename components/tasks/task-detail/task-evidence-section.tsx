"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyStateCompact, SectionCard } from "@/components/detail-ui";
import { TASK_EVIDENCE_STORAGE_BUCKET } from "@/lib/constants/storage";
import { supabase } from "@/lib/supabase";
import { TaskEvidencePreviewModal } from "./task-evidence-preview-modal";
import { formatDateTime } from "./utils";
import { TaskEvidenceForm } from "./task-evidence-form";
import { TaskEvidenceItem } from "./task-evidence-item";
import type { TaskEvidence, TaskEvidenceCreator, TaskEvidenceType } from "./types";

type TaskEvidenceSectionProps = {
  taskId: string;
  currentProfileId: string | null;
  canCreateEvidence: boolean;
};

type TaskEvidenceRow = {
  id: string;
  task_id: string;
  evidence_type: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type EvidenceFormState = {
  type: TaskEvidenceType;
  title: string;
  url: string;
  description: string;
  file: File | null;
};

const DEFAULT_FORM: EvidenceFormState = {
  type: "link",
  title: "",
  url: "",
  description: "",
  file: null,
};

const normalizeEvidenceType = (value: string | null | undefined): TaskEvidenceType => {
  if (value === "file" || value === "other") {
    return value;
  }

  return "link";
};

const normalizeEvidenceRow = (
  row: TaskEvidenceRow,
  creatorsById: Record<string, TaskEvidenceCreator>,
): TaskEvidence => ({
  id: String(row.id),
  task_id: String(row.task_id),
  evidence_type: normalizeEvidenceType(row.evidence_type),
  title: row.title ? String(row.title) : "",
  description: row.description ? String(row.description) : null,
  url: row.url ? String(row.url) : null,
  file_path: row.file_path ? String(row.file_path) : null,
  file_name: row.file_name ? String(row.file_name) : null,
  mime_type: row.mime_type ? String(row.mime_type) : null,
  file_size: typeof row.file_size === "number" ? row.file_size : row.file_size ? Number(row.file_size) : null,
  created_by: row.created_by ? String(row.created_by) : null,
  created_at: row.created_at ? String(row.created_at) : null,
  updated_at: row.updated_at ? String(row.updated_at) : null,
  creator: row.created_by ? (creatorsById[String(row.created_by)] ?? null) : null,
});

const buildStoragePath = (taskId: string, file: File) => {
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safeFileName = file.name
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const fallbackName = safeFileName || "tep";
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `tasks/${taskId}/${suffix}-${fallbackName}${extension ? `.${extension}` : ""}`;
};

const isValidUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const getFilePreviewKind = (
  mimeType: string | null,
): "image" | "video" | "pdf" | "download" => {
  if (!mimeType) {
    return "download";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  return "download";
};

const getFileActionLabel = (mimeType: string | null) => {
  const kind = getFilePreviewKind(mimeType);

  if (kind === "image") {
    return "Xem ảnh";
  }

  if (kind === "video") {
    return "Xem video";
  }

  if (kind === "pdf") {
    return "Xem tệp";
  }

  return "Tải xuống";
};

export function TaskEvidenceSection({
  taskId,
  currentProfileId,
  canCreateEvidence,
}: TaskEvidenceSectionProps) {
  const [evidences, setEvidences] = useState<TaskEvidence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EvidenceFormState>(DEFAULT_FORM);
  const [deletingEvidenceId, setDeletingEvidenceId] = useState<string | null>(null);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    title: string;
    kind: "image" | "video" | "pdf" | null;
    url: string | null;
  }>({
    open: false,
    title: "",
    kind: null,
    url: null,
  });

  const selectedFileName = useMemo(() => form.file?.name ?? null, [form.file]);

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setError(null);
    setIsUploading(false);
    setIsSaving(false);
  };

  const loadEvidences = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: evidenceError } = await supabase
        .from("task_evidences")
        .select(
          "id,task_id,evidence_type,title,description,url,file_path,file_name,mime_type,file_size,created_by,created_at,updated_at",
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (evidenceError) {
        throw new Error(evidenceError.message || "Không thể tải bằng chứng.");
      }

      const evidenceRows = (data ?? []) as TaskEvidenceRow[];
      const creatorIds = [...new Set(evidenceRows.map((item) => item.created_by).filter(Boolean))] as string[];

      let creatorsById: Record<string, TaskEvidenceCreator> = {};
      if (creatorIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,name,avatar")
          .in("id", creatorIds);

        if (profileError) {
          throw new Error(profileError.message || "Không thể tải người tạo bằng chứng.");
        }

        creatorsById = ((profileData ?? []) as Array<Record<string, unknown>>).reduce<
          Record<string, TaskEvidenceCreator>
        >((acc, profile) => {
          const id = String(profile.id);
          acc[id] = {
            id,
            name: profile.name ? String(profile.name) : null,
            avatar: profile.avatar ? String(profile.avatar) : null,
          };
          return acc;
        }, {});
      }

      setEvidences(evidenceRows.map((row) => normalizeEvidenceRow(row, creatorsById)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải bằng chứng.");
      setEvidences([]);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadEvidences();
  }, [loadEvidences]);

  const handleCloseDialog = () => {
    if (isSaving || isUploading) {
      return;
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    const trimmedTitle = form.title.trim();
    const trimmedUrl = form.url.trim();
    const trimmedDescription = form.description.trim();

    if (!trimmedTitle) {
      setError("Vui lòng nhập tiêu đề.");
      return;
    }

    if (form.type === "link" && !trimmedUrl) {
      setError("Vui lòng nhập link.");
      return;
    }

    if (form.type === "link" && !isValidUrl(trimmedUrl)) {
      setError("Link không hợp lệ.");
      return;
    }

    if (form.type === "file" && !form.file) {
      setError("Vui lòng chọn tệp.");
      return;
    }

    if (!currentProfileId) {
      setError("Không thể lưu bằng chứng.");
      return;
    }

    if (!canCreateEvidence) {
      setError("Không thể lưu bằng chứng.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;
      let fileSize: number | null = null;

      if (form.type === "file" && form.file) {
        setIsUploading(true);

        const nextFilePath = buildStoragePath(taskId, form.file);
        const { error: uploadError } = await supabase.storage
          .from(TASK_EVIDENCE_STORAGE_BUCKET)
          .upload(nextFilePath, form.file, {
            upsert: false,
            contentType: form.file.type || undefined,
          });

        if (uploadError) {
          throw new Error(uploadError.message || "Không thể lưu bằng chứng.");
        }

        filePath = nextFilePath;
        fileName = form.file.name;
        mimeType = form.file.type || null;
        fileSize = form.file.size;
      }

      const insertPayload = {
        task_id: taskId,
        evidence_type: form.type,
        title: trimmedTitle,
        description: trimmedDescription || null,
        url: form.type === "link" ? trimmedUrl : null,
        file_path: filePath,
        file_name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        created_by: currentProfileId,
      };

      const { error: insertError } = await supabase.from("task_evidences").insert(insertPayload);

      if (insertError) {
        if (filePath) {
          await supabase.storage.from(TASK_EVIDENCE_STORAGE_BUCKET).remove([filePath]);
        }

        throw new Error(insertError.message || "Không thể lưu bằng chứng.");
      }

      setIsDialogOpen(false);
      resetForm();
      await loadEvidences();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể lưu bằng chứng.");
    } finally {
      setIsUploading(false);
      setIsSaving(false);
    }
  };

  const handleDelete = async (evidence: TaskEvidence) => {
    const confirmed = window.confirm("Xóa bằng chứng này?");
    if (!confirmed) {
      return;
    }

    setDeletingEvidenceId(evidence.id);
    setError(null);

    try {
      if (evidence.evidence_type === "file" && evidence.file_path) {
        const { error: removeFileError } = await supabase.storage
          .from(TASK_EVIDENCE_STORAGE_BUCKET)
          .remove([evidence.file_path]);

        if (removeFileError) {
          throw new Error(removeFileError.message || "Không thể xóa bằng chứng.");
        }
      }

      const { error: deleteError } = await supabase
        .from("task_evidences")
        .delete()
        .eq("id", evidence.id);

      if (deleteError) {
        throw new Error(deleteError.message || "Không thể xóa bằng chứng.");
      }

      setEvidences((current) => current.filter((item) => item.id !== evidence.id));
    } catch (deleteTaskError) {
      setError(
        deleteTaskError instanceof Error
          ? deleteTaskError.message || "Không thể xóa bằng chứng."
          : "Không thể xóa bằng chứng.",
      );
    } finally {
      setDeletingEvidenceId(null);
    }
  };

  const handleOpenLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenFile = async (evidence: TaskEvidence) => {
    if (!evidence.file_path) {
      return;
    }

    setOpeningEvidenceId(evidence.id);
    setError(null);

    try {
      const { data, error: fileError } = await supabase.storage
        .from(TASK_EVIDENCE_STORAGE_BUCKET)
        .createSignedUrl(evidence.file_path, 300);

      if (fileError || !data?.signedUrl) {
        throw new Error(fileError?.message || "Không thể mở tệp.");
      }

      const previewKind = getFilePreviewKind(evidence.mime_type);

      if (previewKind === "download") {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }

      setPreviewState({
        open: true,
        title: evidence.file_name?.trim() || evidence.title,
        kind: previewKind,
        url: data.signedUrl,
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Không thể mở tệp.");
    } finally {
      setOpeningEvidenceId(null);
    }
  };

  return (
    <SectionCard
      title="Bằng chứng hoàn thành"
      actions={
        canCreateEvidence ? (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Thêm bằng chứng
          </button>
        ) : null
      }
    >

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-600">Đang tải...</p>
      ) : evidences.length === 0 ? (
        <EmptyStateCompact>Chưa có bằng chứng hoàn thành.</EmptyStateCompact>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Tiêu đề</th>
                  <th className="px-4 py-3 font-semibold">Loại</th>
                  <th className="px-4 py-3 font-semibold">Người tạo</th>
                  <th className="px-4 py-3 font-semibold">Ngày tạo</th>
                  <th className="px-4 py-3 font-semibold">Ghi chú</th>
                  <th className="px-4 py-3 font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {evidences.map((evidence) => (
                  <TaskEvidenceItem
                    key={evidence.id}
                    evidence={evidence}
                    isDeleting={deletingEvidenceId === evidence.id}
                    isOpeningFile={openingEvidenceId === evidence.id}
                    primaryActionLabel={
                      evidence.evidence_type === "file" ? getFileActionLabel(evidence.mime_type) : null
                    }
                    onOpenLink={handleOpenLink}
                    onOpenFile={handleOpenFile}
                    onDelete={handleDelete}
                    formatDateTime={formatDateTime}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TaskEvidenceForm
        open={isDialogOpen}
        type={form.type}
        title={form.title}
        url={form.url}
        selectedFileName={selectedFileName}
        isSaving={isSaving}
        isUploading={isUploading}
        error={error}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog();
            return;
          }

          setIsDialogOpen(true);
        }}
        onTypeChange={(value) =>
          setForm((current) => ({
            ...current,
            type: value,
            url: value === "link" ? current.url : "",
            file: value === "file" ? current.file : null,
          }))
        }
        onTitleChange={(value) => setForm((current) => ({ ...current, title: value }))}
        onUrlChange={(value) => setForm((current) => ({ ...current, url: value }))}
        onFileChange={(file) => setForm((current) => ({ ...current, file }))}
        onSubmit={() => void handleSubmit()}
        onCancel={handleCloseDialog}
      />

      <TaskEvidencePreviewModal
        open={previewState.open}
        title={previewState.title}
        kind={previewState.kind}
        url={previewState.url}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewState({
              open: false,
              title: "",
              kind: null,
              url: null,
            });
            return;
          }

          setPreviewState((current) => ({ ...current, open: true }));
        }}
      />
    </SectionCard>
  );
}
