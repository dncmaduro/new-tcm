"use client";

import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { commentService } from "./comment-service";
import { createCommentEditorExtensions } from "./comment-editor-extensions";
import {
  applySignedUrlsToDocument,
  collectCommentAttachmentsFromDocument,
  normalizeRichTextDocument,
} from "./rich-text-utils";
import type { RichTextDocument } from "./types";

type CommentRendererProps = {
  bodyJson: RichTextDocument | null;
  bodyText: string;
};

export function CommentRenderer({ bodyJson, bodyText }: CommentRendererProps) {
  const normalizedBodyJson = useMemo(
    () => normalizeRichTextDocument(bodyJson, bodyText),
    [bodyJson, bodyText],
  );
  const serializedBodyJson = useMemo(
    () => JSON.stringify(normalizedBodyJson),
    [normalizedBodyJson],
  );
  const filePaths = useMemo(
    () => collectCommentAttachmentsFromDocument(normalizedBodyJson).map((attachment) => attachment.filePath),
    [normalizedBodyJson],
  );
  const extensions = useMemo(
    () =>
      createCommentEditorExtensions({
        getProfiles: () => [],
        editable: false,
        openLinksOnClick: true,
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: normalizedBodyJson,
    immediatelyRender: false,
    editable: false,
    editorProps: {
      attributes: {
        class: "comment-rich-text comment-rich-text-view text-sm text-slate-700 outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const loadSignedUrls = async () => {
      if (filePaths.length === 0) {
        editor.commands.setContent(normalizedBodyJson);
        return;
      }

      try {
        const signedUrlsByPath = await commentService.getSignedMediaUrls(filePaths);
        editor.commands.setContent(applySignedUrlsToDocument(normalizedBodyJson, signedUrlsByPath));
      } catch {
        editor.commands.setContent(normalizedBodyJson);
      }
    };

    void loadSignedUrls();
  }, [editor, filePaths, normalizedBodyJson, serializedBodyJson]);

  if (!editor) {
    return null;
  }

  return <EditorContent editor={editor} />;
}
