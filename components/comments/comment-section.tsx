"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommentItem } from "./comment-item";
import {
  RichCommentEditor,
  type RichCommentEditorHandle,
} from "./rich-comment-editor";
import { useComments } from "./use-comments";
import type { CommentEntityType, RichCommentSnapshot } from "./types";

type CommentSectionProps = {
  entityType: CommentEntityType;
  entityId: string;
  currentProfileId: string | null;
};

export function CommentSection({
  entityType,
  entityId,
  currentProfileId,
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
      setFormError(
        submitError instanceof Error ? submitError.message : "Không thể gửi bình luận.",
      );
    }
  };

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
      <h2 className="text-base font-semibold text-slate-900">Bình luận</h2>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5">
        {isLoading ? (
          <p className="text-sm text-slate-600">Đang tải...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-600">Chưa có bình luận.</p>
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

      <div className="mt-5 border-t border-slate-200 pt-4 space-y-3">
        <RichCommentEditor
          ref={editorRef}
          entityType={entityType}
          entityId={entityId}
          currentProfileId={currentProfileId}
          profiles={profiles}
          placeholder="Nhập bình luận..."
          disabled={isSubmitting}
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
          >
            {isSubmitting ? "Đang gửi..." : "Gửi"}
          </Button>
        </div>
      </div>
    </article>
  );
}
