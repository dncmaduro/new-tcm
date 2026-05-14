"use client";

import { COMMENT_MEDIA_STORAGE_BUCKET } from "@/lib/constants/storage";
import { supabase } from "@/lib/supabase";
import {
  collectCommentAttachmentsFromDocument,
  normalizeRichTextDocument,
} from "./rich-text-utils";
import type {
  CommentEntityType,
  CommentItem,
  CommentMention,
  CreateCommentInput,
  MentionedProfile,
  UpdateCommentInput,
  UploadedCommentMedia,
} from "./types";

type CommentRow = {
  id: string;
  goal_id: string | null;
  key_result_id: string | null;
  task_id: string | null;
  body_json: unknown;
  body_text: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type CommentMentionRow = {
  id: string;
  comment_id: string | null;
  profile_id: string | null;
  created_at: string | null;
};

type CommentAttachmentRow = {
  id: string;
};

type SignedUrlCacheItem = {
  signedUrl: string;
  expiresAt: number;
};

const ENTITY_COLUMN_BY_TYPE: Record<CommentEntityType, "goal_id" | "key_result_id" | "task_id"> = {
  goal: "goal_id",
  key_result: "key_result_id",
  task: "task_id",
};

const signedUrlCache = new Map<string, SignedUrlCacheItem>();

const toNullableString = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
};

const normalizeProfile = (row: ProfileRow): MentionedProfile => ({
  id: String(row.id),
  name: row.name?.trim() || "Chưa rõ",
  avatar: row.avatar ? String(row.avatar) : null,
});

const resolveEntity = (row: CommentRow): Pick<CommentItem, "entityType" | "entityId"> => {
  if (row.task_id) {
    return {
      entityType: "task",
      entityId: String(row.task_id),
    };
  }

  if (row.key_result_id) {
    return {
      entityType: "key_result",
      entityId: String(row.key_result_id),
    };
  }

  return {
    entityType: "goal",
    entityId: row.goal_id ? String(row.goal_id) : "",
  };
};

const buildCommentPayload = (entityType: CommentEntityType, entityId: string) => ({
  p_goal_id: entityType === "goal" ? entityId : null,
  p_key_result_id: entityType === "key_result" ? entityId : null,
  p_task_id: entityType === "task" ? entityId : null,
});

const buildStoragePath = (entityType: CommentEntityType, entityId: string, file: File) => {
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safeFileName = file.name
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const fallbackName = safeFileName || "tep";
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;

  return `comments/${entityType}/${entityId}/${suffix}-${fallbackName}${extension ? `.${extension}` : ""}`;
};

const isRpcMissingError = (error: { code?: string; message?: string } | null) => {
  if (!error) {
    return false;
  }

  return (
    error.code === "PGRST202" ||
    error.message?.includes("create_comment_with_mentions") ||
    error.message?.includes("Could not find the function") ||
    false
  );
};

const isMissingOptionalTableError = (error: { code?: string; message?: string } | null) => {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    error.message?.toLowerCase().includes("comment_attachments") ||
    false
  );
};

const mapCommentError = (
  error: { code?: string; message?: string } | null,
  fallbackMessage: string,
) => {
  if (!error) {
    return fallbackMessage;
  }

  if (error.code === "42501") {
    return "Bạn không có quyền thực hiện thao tác này.";
  }

  if (isRpcMissingError(error)) {
    return "Thiếu RPC create_comment_with_mentions trên Supabase.";
  }

  return error.message || fallbackMessage;
};

const syncMentionRows = async (commentId: string, mentionedProfiles: MentionedProfile[]) => {
  const uniqueProfiles = mentionedProfiles.filter(
    (profile, index, current) => current.findIndex((item) => item.id === profile.id) === index,
  );

  // Nếu RLS chưa cho phép sửa comment_mentions thì vẫn giữ được nội dung bình luận mới.
  const { error: deleteError } = await supabase
    .from("comment_mentions")
    .delete()
    .eq("comment_id", commentId);

  if (deleteError) {
    return false;
  }

  if (uniqueProfiles.length === 0) {
    return true;
  }

  const { error: insertError } = await supabase.from("comment_mentions").insert(
    uniqueProfiles.map((profile) => ({
      comment_id: commentId,
      profile_id: profile.id,
    })),
  );

  return !insertError;
};

const registerAttachmentDraftIfAvailable = async (
  media: UploadedCommentMedia,
  currentProfileId: string | null,
) => {
  if (!currentProfileId) {
    return null;
  }

  // Schema của comment_attachments không nằm trong codebase hiện tại, nên chỉ đồng bộ best-effort.
  const { data, error } = await supabase
    .from("comment_attachments")
    .insert({
      comment_id: null,
      file_path: media.filePath,
      file_name: media.fileName,
      mime_type: media.mimeType,
      file_size: media.fileSize,
      created_by: currentProfileId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingOptionalTableError(error) || error.code === "42501") {
      return null;
    }

    return null;
  }

  return data ? String((data as CommentAttachmentRow).id) : null;
};

const attachMediaToCommentIfAvailable = async (
  commentId: string | null,
  uploadedMedia: UploadedCommentMedia[],
) => {
  if (!commentId || uploadedMedia.length === 0) {
    return;
  }

  const attachmentIds = uploadedMedia
    .map((media) => media.attachmentId)
    .filter(Boolean) as string[];

  if (attachmentIds.length > 0) {
    const { error } = await supabase
      .from("comment_attachments")
      .update({ comment_id: commentId })
      .in("id", attachmentIds);

    if (!error || isMissingOptionalTableError(error) || error.code === "42501") {
      return;
    }
  }
};

const deleteAttachmentDraftsIfAvailable = async (uploadedMedia: UploadedCommentMedia[]) => {
  const attachmentIds = uploadedMedia
    .map((media) => media.attachmentId)
    .filter(Boolean) as string[];

  if (attachmentIds.length === 0) {
    return;
  }

  await supabase.from("comment_attachments").delete().in("id", attachmentIds);
};

const extractCommentIdFromRpcData = (data: unknown) => {
  if (!data) {
    return null;
  }

  if (Array.isArray(data)) {
    const firstItem = data[0];
    if (firstItem && typeof firstItem === "object" && "id" in firstItem) {
      return String((firstItem as Record<string, unknown>).id);
    }

    return null;
  }

  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (record.id) {
      return String(record.id);
    }

    if (record.comment_id) {
      return String(record.comment_id);
    }
  }

  return null;
};

const revokePreviewUrl = (previewUrl: string | null) => {
  if (!previewUrl?.startsWith("blob:")) {
    return;
  }

  URL.revokeObjectURL(previewUrl);
};

export const commentService = {
  async fetchMentionableProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,avatar")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message || "Không tải được danh sách nhân sự.");
    }

    return ((data ?? []) as ProfileRow[])
      .filter((row) => row.id && row.name?.trim())
      .map(normalizeProfile);
  },

  async fetchComments(entityType: CommentEntityType, entityId: string) {
    const entityColumn = ENTITY_COLUMN_BY_TYPE[entityType];
    const { data, error } = await supabase
      .from("comments")
      .select("id,goal_id,key_result_id,task_id,body_json,body_text,created_by,created_at,updated_at,deleted_at")
      .eq(entityColumn, entityId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Không tải được bình luận.");
    }

    const commentRows = (data ?? []) as CommentRow[];
    const creatorIds = [...new Set(commentRows.map((row) => row.created_by).filter(Boolean))] as string[];
    const commentIds = commentRows.map((row) => String(row.id));

    const [creatorResult, mentionResult] = await Promise.all([
      creatorIds.length > 0
        ? supabase.from("profiles").select("id,name,avatar").in("id", creatorIds)
        : Promise.resolve({ data: [], error: null }),
      commentIds.length > 0
        ? supabase
            .from("comment_mentions")
            .select("id,comment_id,profile_id,created_at")
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (creatorResult.error) {
      throw new Error(creatorResult.error.message || "Không tải được người bình luận.");
    }

    if (mentionResult.error) {
      throw new Error(mentionResult.error.message || "Không tải được người được nhắc.");
    }

    const creatorsById = ((creatorResult.data ?? []) as ProfileRow[]).reduce<Record<string, MentionedProfile>>(
      (acc, row) => {
        acc[String(row.id)] = normalizeProfile(row);
        return acc;
      },
      {},
    );

    const mentionRows = (mentionResult.data ?? []) as CommentMentionRow[];
    const mentionedProfileIds = [
      ...new Set(mentionRows.map((row) => row.profile_id).filter(Boolean)),
    ] as string[];

    let mentionedProfilesById: Record<string, MentionedProfile> = {};
    if (mentionedProfileIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,avatar")
        .in("id", mentionedProfileIds);

      if (profileError) {
        throw new Error(profileError.message || "Không tải được hồ sơ người được nhắc.");
      }

      mentionedProfilesById = ((profileData ?? []) as ProfileRow[]).reduce<Record<string, MentionedProfile>>(
        (acc, row) => {
          acc[String(row.id)] = normalizeProfile(row);
          return acc;
        },
        {},
      );
    }

    const mentionsByCommentId = mentionRows.reduce<Record<string, CommentMention[]>>((acc, row) => {
      if (!row.comment_id || !row.profile_id) {
        return acc;
      }

      const commentId = String(row.comment_id);
      if (!acc[commentId]) {
        acc[commentId] = [];
      }

      acc[commentId].push({
        id: String(row.id),
        commentId,
        profileId: String(row.profile_id),
        createdAt: toNullableString(row.created_at),
        profile: mentionedProfilesById[String(row.profile_id)] ?? null,
      });

      return acc;
    }, {});

    return commentRows.map<CommentItem>((row) => {
      const entity = resolveEntity(row);
      const bodyText = row.body_text?.trim() || "";
      const bodyJson = normalizeRichTextDocument(row.body_json, bodyText);

      return {
        id: String(row.id),
        entityType: entity.entityType,
        entityId: entity.entityId,
        bodyJson,
        bodyText,
        createdBy: toNullableString(row.created_by),
        createdAt: toNullableString(row.created_at),
        updatedAt: toNullableString(row.updated_at),
        deletedAt: toNullableString(row.deleted_at),
        creator: row.created_by ? creatorsById[String(row.created_by)] ?? null : null,
        mentions: mentionsByCommentId[String(row.id)] ?? [],
        attachments: collectCommentAttachmentsFromDocument(bodyJson),
      };
    });
  },

  async uploadCommentMedia(params: {
    entityType: CommentEntityType;
    entityId: string;
    file: File;
    currentProfileId: string | null;
  }) {
    const nextFilePath = buildStoragePath(params.entityType, params.entityId, params.file);
    const { error: uploadError } = await supabase.storage
      .from(COMMENT_MEDIA_STORAGE_BUCKET)
      .upload(nextFilePath, params.file, {
        upsert: false,
        contentType: params.file.type || undefined,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Không thể tải tệp lên.");
    }

    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const attachmentId = await registerAttachmentDraftIfAvailable(
      {
        id: null,
        commentId: null,
        kind: params.file.type.startsWith("video/") ? "video" : "image",
        bucket: COMMENT_MEDIA_STORAGE_BUCKET,
        filePath: nextFilePath,
        fileName: params.file.name,
        mimeType: params.file.type || null,
        fileSize: params.file.size,
        externalUrl: null,
        localId,
        previewUrl: null,
        attachmentId: null,
      },
      params.currentProfileId,
    );

    return {
      id: null,
      commentId: null,
      kind: params.file.type.startsWith("video/") ? "video" : "image",
      bucket: COMMENT_MEDIA_STORAGE_BUCKET,
      filePath: nextFilePath,
      fileName: params.file.name,
      mimeType: params.file.type || null,
      fileSize: params.file.size,
      externalUrl: null,
      localId,
      previewUrl: null,
      attachmentId,
    } satisfies UploadedCommentMedia;
  },

  async cleanupUploadedMedia(uploadedMedia: UploadedCommentMedia[]) {
    const filePaths = uploadedMedia.map((media) => media.filePath);

    if (filePaths.length > 0) {
      await supabase.storage.from(COMMENT_MEDIA_STORAGE_BUCKET).remove(filePaths);
    }

    await deleteAttachmentDraftsIfAvailable(uploadedMedia);
    uploadedMedia.forEach((media) => revokePreviewUrl(media.previewUrl));
  },

  async getSignedMediaUrls(filePaths: string[]) {
    const now = Date.now();
    const uniquePaths = [...new Set(filePaths.filter(Boolean))];
    const cached: Record<string, string> = {};
    const missingPaths: string[] = [];

    uniquePaths.forEach((path) => {
      const cacheItem = signedUrlCache.get(path);
      if (cacheItem && cacheItem.expiresAt > now) {
        cached[path] = cacheItem.signedUrl;
        return;
      }

      missingPaths.push(path);
    });

    if (missingPaths.length === 0) {
      return cached;
    }

    const { data, error } = await supabase.storage
      .from(COMMENT_MEDIA_STORAGE_BUCKET)
      .createSignedUrls(missingPaths, 3600);

    if (error || !data) {
      throw new Error(error?.message || "Không thể tải media bình luận.");
    }

    const fetched = data.reduce<Record<string, string>>((acc, item) => {
      if (!item.path || item.error || !item.signedUrl) {
        return acc;
      }

      signedUrlCache.set(item.path, {
        signedUrl: item.signedUrl,
        expiresAt: now + 55 * 60 * 1000,
      });
      acc[item.path] = item.signedUrl;
      return acc;
    }, {});

    return {
      ...cached,
      ...fetched,
    };
  },

  async createComment(input: CreateCommentInput) {
    const { data, error } = await supabase.rpc("create_comment_with_mentions", {
      ...buildCommentPayload(input.entityType, input.entityId),
      p_body_json: input.bodyJson,
      p_body_text: input.bodyText,
      p_mentioned_profile_ids: input.mentionedProfileIds,
    });

    if (error) {
      throw new Error(mapCommentError(error, "Không thể gửi bình luận."));
    }

    const commentId = extractCommentIdFromRpcData(data);
    await attachMediaToCommentIfAvailable(commentId, input.uploadedMedia);

    return {
      commentId,
    };
  },

  async updateComment(input: UpdateCommentInput) {
    const { error } = await supabase
      .from("comments")
      .update({
        body_json: input.bodyJson,
        body_text: input.bodyText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.commentId);

    if (error) {
      throw new Error(mapCommentError(error, "Không thể cập nhật bình luận."));
    }

    await attachMediaToCommentIfAvailable(input.commentId, input.uploadedMedia);
    const mentionSyncSucceeded = await syncMentionRows(input.commentId, input.mentionedProfiles);
    return { mentionSyncSucceeded };
  },

  async deleteComment(commentId: string) {
    const { error } = await supabase
      .from("comments")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", commentId);

    if (error) {
      throw new Error(mapCommentError(error, "Không thể xóa bình luận."));
    }
  },
};
