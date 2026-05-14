"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskEvidenceType } from "./types";

type TaskEvidenceFormProps = {
  open: boolean;
  type: TaskEvidenceType;
  title: string;
  url: string;
  selectedFileName: string | null;
  isSaving: boolean;
  isUploading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onTypeChange: (value: TaskEvidenceType) => void;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function TaskEvidenceForm({
  open,
  type,
  title,
  url,
  selectedFileName,
  isSaving,
  isUploading,
  error,
  onOpenChange,
  onTypeChange,
  onTitleChange,
  onUrlChange,
  onFileChange,
  onSubmit,
  onCancel,
}: TaskEvidenceFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm bằng chứng</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Loại bằng chứng</label>
            <Select value={type} onValueChange={(value) => onTypeChange(value as TaskEvidenceType)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Chọn loại bằng chứng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link">Link</SelectItem>
                <SelectItem value="file">Tệp</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Tiêu đề</label>
            <input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {type === "link" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Link</label>
              <input
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          ) : null}

          {type === "file" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Tệp</label>
              <input
                type="file"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              />
              {selectedFileName ? <p className="text-sm text-slate-600">{selectedFileName}</p> : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving || isUploading}
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSaving || isUploading}
              className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isUploading ? "Đang tải tệp..." : isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
