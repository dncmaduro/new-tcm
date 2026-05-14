"use client";

import type { JSONContent } from "@tiptap/core";

export type CommentEntityType = "goal" | "key_result" | "task";

export type MentionedProfile = {
  id: string;
  name: string;
  avatar: string | null;
};

export type CommentMention = {
  id: string;
  commentId: string;
  profileId: string;
  createdAt: string | null;
  profile: MentionedProfile | null;
};

export type CommentAttachmentKind = "image" | "video";

export type CommentAttachment = {
  id: string | null;
  commentId: string | null;
  kind: CommentAttachmentKind;
  bucket: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  externalUrl: string | null;
};

export type UploadedCommentMedia = CommentAttachment & {
  localId: string;
  previewUrl: string | null;
  attachmentId: string | null;
};

export type RichTextDocument = JSONContent;

export type RichCommentSnapshot = {
  bodyJson: RichTextDocument;
  bodyText: string;
  mentionedProfileIds: string[];
  mentionedProfiles: MentionedProfile[];
  attachments: CommentAttachment[];
  uploadedMedia: UploadedCommentMedia[];
  hasContent: boolean;
};

export type CommentItem = {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  bodyJson: RichTextDocument | null;
  bodyText: string;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  creator: MentionedProfile | null;
  mentions: CommentMention[];
  attachments: CommentAttachment[];
};

export type CreateCommentInput = {
  entityType: CommentEntityType;
  entityId: string;
  bodyJson: RichTextDocument;
  bodyText: string;
  mentionedProfileIds: string[];
  uploadedMedia: UploadedCommentMedia[];
  currentProfileId: string | null;
};

export type UpdateCommentInput = {
  commentId: string;
  bodyJson: RichTextDocument;
  bodyText: string;
  mentionedProfiles: MentionedProfile[];
  uploadedMedia: UploadedCommentMedia[];
  currentProfileId: string | null;
};
