"use client";

import { useCallback, useEffect, useState } from "react";
import { commentService } from "./comment-service";
import type {
  CommentEntityType,
  CommentItem,
  MentionedProfile,
  RichCommentSnapshot,
} from "./types";

type UseCommentsOptions = {
  entityType: CommentEntityType;
  entityId: string;
};

export function useComments({ entityType, entityId }: UseCommentsOptions) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [profiles, setProfiles] = useState<MentionedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    if (!entityId) {
      setComments([]);
      setProfiles([]);
      setIsLoading(false);
      setError("Liên kết bình luận không hợp lệ.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const [commentsResult, profilesResult] = await Promise.allSettled([
      commentService.fetchComments(entityType, entityId),
      commentService.fetchMentionableProfiles(),
    ]);

    setComments(commentsResult.status === "fulfilled" ? commentsResult.value : []);
    setProfiles(profilesResult.status === "fulfilled" ? profilesResult.value : []);

    const nextError =
      commentsResult.status === "rejected"
        ? commentsResult.reason instanceof Error
          ? commentsResult.reason.message
          : "Không tải được bình luận."
        : profilesResult.status === "rejected"
          ? profilesResult.reason instanceof Error
            ? profilesResult.reason.message
            : "Không tải được danh sách nhân sự."
          : null;

    setError(nextError);
    setIsLoading(false);
  }, [entityId, entityType]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const createComment = useCallback(
    async (snapshot: RichCommentSnapshot, currentProfileId: string | null) => {
      if (!snapshot.hasContent) {
        throw new Error("Vui lòng nhập bình luận.");
      }

      setIsSubmitting(true);

      try {
        const result = await commentService.createComment({
          entityType,
          entityId,
          bodyText: snapshot.bodyText,
          bodyJson: snapshot.bodyJson,
          mentionedProfileIds: snapshot.mentionedProfileIds,
          uploadedMedia: snapshot.uploadedMedia,
          currentProfileId,
        });

        await loadComments();
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [entityId, entityType, loadComments],
  );

  const updateComment = useCallback(
    async (
      commentId: string,
      snapshot: RichCommentSnapshot,
      currentProfileId: string | null,
    ) => {
      if (!snapshot.hasContent) {
        throw new Error("Vui lòng nhập bình luận.");
      }

      setSavingCommentId(commentId);

      try {
        const result = await commentService.updateComment({
          commentId,
          bodyText: snapshot.bodyText,
          bodyJson: snapshot.bodyJson,
          mentionedProfiles: snapshot.mentionedProfiles,
          uploadedMedia: snapshot.uploadedMedia,
          currentProfileId,
        });

        await loadComments();
        return result;
      } finally {
        setSavingCommentId(null);
      }
    },
    [loadComments],
  );

  const deleteComment = useCallback(async (commentId: string) => {
    setDeletingCommentId(commentId);

    try {
      await commentService.deleteComment(commentId);
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } finally {
      setDeletingCommentId(null);
    }
  }, []);

  return {
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
    reloadComments: loadComments,
  };
}
