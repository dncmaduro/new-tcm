"use client";

import { useRef, useState } from "react";
import { EmptyStateCompact, SectionCard } from "@/components/detail-ui";
import { Button } from "@/components/ui/button";
import { CommentItem } from "./comment-item";
import { RichCommentEditor, type RichCommentEditorHandle } from "./rich-comment-editor";
import { useComments } from "./use-comments";
import type { CommentEntityType, RichCommentSnapshot } from "./types";

type CommentSectionProps = {
  entityType: CommentEntityType;
  entityId: string;
  currentProfileId: string | null;
  compact?: boolean;
};

export function CommentSection({
  entityType,
  entityId,
  currentProfileId,
  compact = false,
}: CommentSectionProps) {
  const editorRef = useRef<RichCommentEditorHandle | null>(null);
  const {
    comments,
    profiles,
    isLoading,
    isSubmitting,
    savingCommentId,
    deletingCommentId,
    error,
    createComment,
    updateComment,
    deleteComment,
  } = useComments({
    entityType,
    entityId,
  });

  const [draftSnapshot, setDraftSnapshot] = useState<RichCommentSnapshot | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async () => {
    if (!draftSnapshot?.hasContent) {
      setFormError("Vui lòng nhập bình luận.");
      return;
    }

    try {
      setFormError(null);
      await editorRef.current?.cleanupUnreferencedPendingMedia();
      await createComment(draftSnapshot, currentProfileId);
      editorRef.current?.resetPendingMedia();
      editorRef.current?.clear();
    } catch (submitError) {
      await editorRef.current?.cleanupAllPendingMedia();
      setFormError(submitError instanceof Error ? submitError.message : "Không thể gửi bình luận.");
    }
  };

  return (
    <SectionCard title="Bình luận">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div>
        {isLoading ? (
          <p className="text-sm text-slate-600">Đang tải...</p>
        ) : comments.length === 0 ? (
          <EmptyStateCompact>Chưa có bình luận.</EmptyStateCompact>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                profiles={profiles}
                currentProfileId={currentProfileId}
                isSaving={savingCommentId === comment.id}
                isDeleting={deletingCommentId === comment.id}
                onSave={updateComment}
                onDelete={deleteComment}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 border-slate-200 pt-4">
        <RichCommentEditor
          ref={editorRef}
          entityType={entityType}
          entityId={entityId}
          currentProfileId={currentProfileId}
          profiles={profiles}
          placeholder="Nhập bình luận..."
          disabled={isSubmitting}
          compact={compact}
          onChange={(snapshot) => {
            setDraftSnapshot(snapshot);
            if (formError && snapshot.hasContent) {
              setFormError(null);
            }
          }}
          onErrorChange={setFormError}
          onUploadingChange={setIsUploading}
        />

        {formError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {formError}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || isUploading}
            className={compact ? "h-8 rounded-lg px-3 text-xs" : ""}
          >
            {isSubmitting ? "Đang gửi..." : "Gửi"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
