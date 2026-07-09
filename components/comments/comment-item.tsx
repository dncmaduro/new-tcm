"use client";

import { useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTimeDdMmYyyy } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { CommentRenderer } from "./comment-renderer";
import { RichCommentEditor, type RichCommentEditorHandle } from "./rich-comment-editor";
import type {
  CommentItem as CommentItemData,
  MentionedProfile,
  RichCommentSnapshot,
} from "./types";

type CommentItemProps = {
  comment: CommentItemData;
  profiles: MentionedProfile[];
  currentProfileId: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (
    commentId: string,
    snapshot: RichCommentSnapshot,
    currentProfileId: string | null,
  ) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<void>;
};

const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

const formatCommentTime = (value: string | null) =>
  formatDateTimeDdMmYyyy(value, "Chưa có", "Không hợp lệ");

export function CommentItem({
  comment,
  profiles,
  currentProfileId,
  isSaving,
  isDeleting,
  onSave,
  onDelete,
}: CommentItemProps) {
  const editorRef = useRef<RichCommentEditorHandle | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftSnapshot, setDraftSnapshot] = useState<RichCommentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const canManage = Boolean(currentProfileId) && currentProfileId === comment.createdBy;
  const creatorName = comment.creator?.name ?? "Chưa rõ";

  const metaLabel = useMemo(() => {
    if (comment.updatedAt && comment.updatedAt !== comment.createdAt) {
      return `Đã sửa ${formatCommentTime(comment.updatedAt)}`;
    }

    return formatCommentTime(comment.createdAt);
  }, [comment.createdAt, comment.updatedAt]);

  const handleStartEdit = () => {
    setDraftSnapshot(null);
    setError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = async () => {
    await editorRef.current?.cleanupAllPendingMedia();
    setDraftSnapshot(null);
    setError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!draftSnapshot?.hasContent) {
      setError("Vui lòng nhập bình luận.");
      return;
    }

    try {
      setError(null);
      await editorRef.current?.cleanupUnreferencedPendingMedia();
      await onSave(comment.id, draftSnapshot, currentProfileId);
      editorRef.current?.resetPendingMedia();
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể cập nhật bình luận.");
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm("Xóa bình luận này?");
    if (!confirmed) {
      return;
    }

    try {
      await onDelete(comment.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa bình luận.");
    }
  };

  return (
    <div
      className={cn(
        "group rounded-2xl border border-slate-200 bg-slate-50/55 p-4",
        isEditing && "bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {comment.creator?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.creator.avatar}
              alt={creatorName}
              className="mt-0.5 h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {getInitial(creatorName)}
            </span>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{creatorName}</p>
            <p className="mt-0.5 text-xs text-slate-500">{metaLabel}</p>
          </div>
        </div>

        {canManage ? (
          <div
            className={cn(
              "pointer-events-none flex items-center gap-2 opacity-0 transition-opacity",
              "group-hover:pointer-events-auto group-hover:opacity-100",
              "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
              isEditing && "pointer-events-auto opacity-100",
            )}
          >
            {!isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleStartEdit}
                  disabled={isDeleting}
                  aria-label="Sửa bình luận"
                  title="Sửa"
                  className="h-8 w-8 text-slate-500"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  aria-label="Xóa bình luận"
                  title="Xóa"
                  className="h-8 w-8 text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-3">
            <RichCommentEditor
              ref={editorRef}
              entityType={comment.entityType}
              entityId={comment.entityId}
              currentProfileId={currentProfileId}
              profiles={profiles}
              initialContent={comment.bodyJson}
              placeholder="Nhập bình luận..."
              disabled={isSaving}
              autoFocus
              onChange={setDraftSnapshot}
              onErrorChange={setError}
              onUploadingChange={setIsUploading}
            />

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || isUploading}
              >
                {isSaving ? "Đang lưu..." : "Lưu"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCancelEdit()}
                disabled={isSaving || isUploading}
              >
                Hủy
              </Button>
            </div>
          </div>
        ) : (
          <>
            {error ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
            <CommentRenderer bodyJson={comment.bodyJson} bodyText={comment.bodyText} />
          </>
        )}
      </div>
    </div>
  );
}
