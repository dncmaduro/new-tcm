"use client";

import type { JSONContent } from "@tiptap/core";
import type {
  CommentAttachment,
  CommentAttachmentKind,
  MentionedProfile,
  RichTextDocument,
  UploadedCommentMedia,
} from "./types";

type RichNodeAttributes = Record<string, unknown>;

const MEDIA_NODE_TYPES = new Set(["image", "commentVideo"]);

const cloneDocument = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toTextNode = (text: string): JSONContent => ({
  type: "text",
  text,
});

const getStringAttribute = (attrs: RichNodeAttributes, key: string) => {
  const value = attrs[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const getNumberAttribute = (attrs: RichNodeAttributes, key: string) => {
  const value = attrs[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isMentionNode = (node: JSONContent) => node.type === "mention";

const isMediaNode = (node: JSONContent) => Boolean(node.type && MEDIA_NODE_TYPES.has(node.type));

const iterateNodes = (
  node: JSONContent | null | undefined,
  visitor: (currentNode: JSONContent) => void,
) => {
  if (!node) {
    return;
  }

  visitor(node);
  node.content?.forEach((childNode) => iterateNodes(childNode, visitor));
};

const collectTextNodes = (
  node: JSONContent | null | undefined,
  result: JSONContent[] = [],
) => {
  if (!node) {
    return result;
  }

  if (typeof node.text === "string") {
    result.push(node);
  }

  node.content?.forEach((childNode) => collectTextNodes(childNode, result));
  return result;
};

const trimBoundaryWhitespaceInDocument = (document: RichTextDocument) => {
  const textNodes = collectTextNodes(document);
  if (textNodes.length === 0) {
    return document;
  }

  const firstTextNode = textNodes[0];
  const lastTextNode = textNodes[textNodes.length - 1];

  if (typeof firstTextNode.text === "string") {
    firstTextNode.text = firstTextNode.text.trimStart();
  }

  if (typeof lastTextNode.text === "string") {
    lastTextNode.text = lastTextNode.text.trimEnd();
  }

  return document;
};

export const createEmptyRichTextDocument = (): RichTextDocument => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
    },
  ],
});

export const createParagraphDocumentFromText = (text: string): RichTextDocument => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return createEmptyRichTextDocument();
  }

  const lines = text.split(/\n{2,}/g);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line
        .split("\n")
        .flatMap((segment, index, current) =>
          index < current.length - 1
            ? [toTextNode(segment), { type: "hardBreak" }]
            : [toTextNode(segment)],
        )
        .filter((item) => item.text !== "" || item.type === "hardBreak"),
    })),
  };
};

export const normalizeRichTextDocument = (
  value: unknown,
  bodyText: string,
): RichTextDocument => {
  if (!value || typeof value !== "object") {
    return createParagraphDocumentFromText(bodyText);
  }

  const rawDocument = value as Record<string, unknown>;
  if (rawDocument.type === "plain_text") {
    return createParagraphDocumentFromText(
      typeof rawDocument.text === "string" ? rawDocument.text : bodyText,
    );
  }

  if (rawDocument.type === "doc") {
    return cloneDocument(rawDocument as RichTextDocument);
  }

  return createParagraphDocumentFromText(bodyText);
};

export const getPlainTextFromRichTextDocument = (document: RichTextDocument) => {
  let value = "";

  iterateNodes(document, (node) => {
    if (typeof node.text === "string") {
      value += node.text;
      return;
    }

    if (isMentionNode(node)) {
      const attrs = (node.attrs ?? {}) as RichNodeAttributes;
      const label = getStringAttribute(attrs, "label");
      if (label) {
        value += `@${label}`;
      }
      return;
    }

    if (node.type === "paragraph" || node.type === "bulletList" || node.type === "orderedList") {
      value += "\n";
      return;
    }

    if (isMediaNode(node)) {
      value += "\n";
    }
  });

  return value.replace(/\n{3,}/g, "\n\n").trim();
};

export const hasRichTextContent = (document: RichTextDocument) => {
  let found = false;

  iterateNodes(document, (node) => {
    if (found) {
      return;
    }

    if (typeof node.text === "string" && node.text.trim()) {
      found = true;
      return;
    }

    if (isMentionNode(node)) {
      found = true;
      return;
    }

    if (isMediaNode(node)) {
      found = true;
    }
  });

  return found;
};

export const collectMentionedProfileIdsFromDocument = (document: RichTextDocument) => {
  const ids: string[] = [];

  iterateNodes(document, (node) => {
    if (!isMentionNode(node)) {
      return;
    }

    const attrs = (node.attrs ?? {}) as RichNodeAttributes;
    const id = getStringAttribute(attrs, "id");
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  });

  return ids;
};

export const collectMentionedProfilesFromDocument = (
  document: RichTextDocument,
  profiles: MentionedProfile[],
) => {
  const profilesById = profiles.reduce<Record<string, MentionedProfile>>((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  }, {});

  return collectMentionedProfileIdsFromDocument(document)
    .map((profileId) => profilesById[profileId])
    .filter(Boolean);
};

const getAttachmentKind = (nodeType: string): CommentAttachmentKind =>
  nodeType === "commentVideo" ? "video" : "image";

export const collectCommentAttachmentsFromDocument = (document: RichTextDocument) => {
  const attachments: CommentAttachment[] = [];

  iterateNodes(document, (node) => {
    if (!node.type || !MEDIA_NODE_TYPES.has(node.type)) {
      return;
    }

    const attrs = (node.attrs ?? {}) as RichNodeAttributes;
    const filePath = getStringAttribute(attrs, "filePath");
    const fileName = getStringAttribute(attrs, "fileName");

    if (!filePath || !fileName) {
      return;
    }

    attachments.push({
      id: null,
      commentId: null,
      kind: getAttachmentKind(node.type),
      bucket: getStringAttribute(attrs, "bucket") ?? "comment_media_files",
      filePath,
      fileName,
      mimeType: getStringAttribute(attrs, "mimeType"),
      fileSize: getNumberAttribute(attrs, "fileSize"),
      externalUrl: getStringAttribute(attrs, "externalUrl"),
    });
  });

  return attachments.filter(
    (attachment, index, current) =>
      current.findIndex((item) => item.filePath === attachment.filePath) === index,
  );
};

export const getReferencedAttachmentPaths = (document: RichTextDocument) =>
  collectCommentAttachmentsFromDocument(document).map((attachment) => attachment.filePath);

export const normalizeRichTextDocumentForStorage = (document: RichTextDocument) => {
  const nextDocument = trimBoundaryWhitespaceInDocument(cloneDocument(document));

  iterateNodes(nextDocument, (node) => {
    if (!node.type || !MEDIA_NODE_TYPES.has(node.type)) {
      return;
    }

    const attrs = ((node.attrs ?? {}) as RichNodeAttributes);
    const filePath = getStringAttribute(attrs, "filePath");
    const externalUrl = getStringAttribute(attrs, "externalUrl");

    node.attrs = {
      ...attrs,
      src: externalUrl ?? filePath ?? null,
    };
  });

  return nextDocument;
};

export const applySignedUrlsToDocument = (
  document: RichTextDocument,
  signedUrlsByPath: Record<string, string>,
) => {
  const nextDocument = cloneDocument(document);

  iterateNodes(nextDocument, (node) => {
    if (!node.type || !MEDIA_NODE_TYPES.has(node.type)) {
      return;
    }

    const attrs = (node.attrs ?? {}) as RichNodeAttributes;
    const filePath = getStringAttribute(attrs, "filePath");
    const externalUrl = getStringAttribute(attrs, "externalUrl");

    node.attrs = {
      ...attrs,
      src: filePath ? signedUrlsByPath[filePath] ?? externalUrl ?? filePath : externalUrl,
    };
  });

  return nextDocument;
};

export const removeMediaNodesByFilePaths = (
  document: RichTextDocument,
  filePathsToRemove: string[],
) => {
  if (filePathsToRemove.length === 0) {
    return cloneDocument(document);
  }

  const shouldRemoveNode = (node: JSONContent) => {
    if (!node.type || !MEDIA_NODE_TYPES.has(node.type)) {
      return false;
    }

    const attrs = (node.attrs ?? {}) as RichNodeAttributes;
    const filePath = getStringAttribute(attrs, "filePath");
    return Boolean(filePath && filePathsToRemove.includes(filePath));
  };

  const pruneNode = (node: JSONContent): JSONContent | null => {
    if (shouldRemoveNode(node)) {
      return null;
    }

    if (!node.content?.length) {
      return node;
    }

    const nextContent = node.content
      .map((childNode) => pruneNode(childNode))
      .filter(Boolean) as JSONContent[];

    return {
      ...node,
      content: nextContent,
    };
  };

  return (pruneNode(cloneDocument(document)) ?? createEmptyRichTextDocument()) as RichTextDocument;
};

export const mergeUploadedMediaWithDocumentAttachments = (
  document: RichTextDocument,
  uploadedMedia: UploadedCommentMedia[],
) => {
  const attachments = collectCommentAttachmentsFromDocument(document);
  const uploadedMediaByPath = uploadedMedia.reduce<Record<string, UploadedCommentMedia>>((acc, media) => {
    acc[media.filePath] = media;
    return acc;
  }, {});

  return attachments.map((attachment) => ({
    ...attachment,
    attachmentId: uploadedMediaByPath[attachment.filePath]?.attachmentId ?? null,
    localId: uploadedMediaByPath[attachment.filePath]?.localId ?? attachment.filePath,
    previewUrl: uploadedMediaByPath[attachment.filePath]?.previewUrl ?? null,
  }));
};
