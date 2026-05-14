"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { Bold, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Underline as UnderlineIcon, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { commentService } from "./comment-service";
import {
  createCommentEditorExtensions,
  resolveVideoLinkPayload,
} from "./comment-editor-extensions";
import {
  collectCommentAttachmentsFromDocument,
  collectMentionedProfileIdsFromDocument,
  collectMentionedProfilesFromDocument,
  createEmptyRichTextDocument,
  getPlainTextFromRichTextDocument,
  hasRichTextContent,
  normalizeRichTextDocumentForStorage,
  removeMediaNodesByFilePaths,
} from "./rich-text-utils";
import type {
  CommentEntityType,
  MentionedProfile,
  RichCommentSnapshot,
  RichTextDocument,
  UploadedCommentMedia,
} from "./types";

type RichCommentEditorProps = {
  entityType: CommentEntityType;
  entityId: string;
  currentProfileId: string | null;
  profiles: MentionedProfile[];
  initialContent?: RichTextDocument | null;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (snapshot: RichCommentSnapshot) => void;
  onErrorChange?: (error: string | null) => void;
  onUploadingChange?: (isUploading: boolean) => void;
};

export type RichCommentEditorHandle = {
  clear: () => void;
  focus: () => void;
  cleanupAllPendingMedia: () => Promise<void>;
  cleanupUnreferencedPendingMedia: () => Promise<void>;
  resetPendingMedia: () => void;
};

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";
const ACCEPTED_VIDEO_TYPES = "video/mp4,video/webm,video/ogg,video/quicktime";

const createPreviewUrl = (file: File) => URL.createObjectURL(file);

const createUploadPlaceholderId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const findPlaceholderRange = (editorInstance: Editor, uploadId: string) => {
  let matchedRange: { from: number; to: number } | null = null;

  editorInstance.state.doc.descendants((node, position) => {
    if (
      node.type.name === "commentUploadPlaceholder" &&
      node.attrs.uploadId === uploadId
    ) {
      matchedRange = {
        from: position,
        to: position + node.nodeSize,
      };
      return false;
    }

    return true;
  });

  return matchedRange;
};

const replacePlaceholderWithContent = (
  editorInstance: Editor,
  uploadId: string,
  content: JSONContent,
) => {
  const range = findPlaceholderRange(editorInstance, uploadId);
  if (!range) {
    return;
  }

  editorInstance.chain().focus().insertContentAt(range, content).run();
};

const removePlaceholder = (editorInstance: Editor, uploadId: string) => {
  const range = findPlaceholderRange(editorInstance, uploadId);
  if (!range) {
    return;
  }

  editorInstance.chain().focus().deleteRange(range).run();
};

export const RichCommentEditor = forwardRef<RichCommentEditorHandle, RichCommentEditorProps>(
  function RichCommentEditor(
    {
      entityType,
      entityId,
      currentProfileId,
      profiles,
      initialContent,
      placeholder,
      disabled = false,
      autoFocus = false,
      onChange,
      onErrorChange,
      onUploadingChange,
    },
    ref,
  ) {
    const [videoLink, setVideoLink] = useState("");
    const [isVideoPopoverOpen, setIsVideoPopoverOpen] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const videoInputRef = useRef<HTMLInputElement | null>(null);
    const pendingMediaRef = useRef<UploadedCommentMedia[]>([]);
    const onChangeRef = useRef(onChange);
    const onErrorChangeRef = useRef(onErrorChange);
    const onUploadingChangeRef = useRef(onUploadingChange);

    const initialDocument = useMemo(
      () => initialContent ?? createEmptyRichTextDocument(),
      [initialContent],
    );
    const initialDocumentKey = useMemo(
      () => JSON.stringify(initialDocument),
      [initialDocument],
    );

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onErrorChangeRef.current = onErrorChange;
    }, [onErrorChange]);

    useEffect(() => {
      onUploadingChangeRef.current = onUploadingChange;
    }, [onUploadingChange]);

    const buildSnapshot = useCallback(
      (editorInstance: Editor, pendingMedia: UploadedCommentMedia[]) => {
        const bodyJson = normalizeRichTextDocumentForStorage(
          editorInstance.getJSON() as RichTextDocument,
        );
        const bodyText = getPlainTextFromRichTextDocument(bodyJson);

        return {
          bodyJson,
          bodyText,
          mentionedProfileIds: collectMentionedProfileIdsFromDocument(bodyJson),
          mentionedProfiles: collectMentionedProfilesFromDocument(bodyJson, profiles),
          attachments: collectCommentAttachmentsFromDocument(bodyJson),
          uploadedMedia: pendingMedia,
          hasContent: hasRichTextContent(bodyJson),
        } satisfies RichCommentSnapshot;
      },
      [profiles],
    );

    const emitSnapshot = useCallback(
      (editorInstance: Editor | null) => {
        if (!editorInstance) {
          return;
        }

        onChangeRef.current?.(buildSnapshot(editorInstance, pendingMediaRef.current));
      },
      [buildSnapshot],
    );

    const cleanupMedia = useCallback(
      async (filePaths: string[]) => {
        if (filePaths.length === 0) {
          return;
        }

        const mediaToCleanup = pendingMediaRef.current.filter((media) =>
          filePaths.includes(media.filePath),
        );
        if (mediaToCleanup.length === 0) {
          return;
        }

        await commentService.cleanupUploadedMedia(mediaToCleanup);
        pendingMediaRef.current = pendingMediaRef.current.filter(
          (media) => !filePaths.includes(media.filePath),
        );
      },
      [],
    );

    const uploadFilesToEditor = useCallback(
      async (editorInstance: Editor, files: File[], position?: number) => {
        if (!currentProfileId) {
          onErrorChangeRef.current?.("Không thể tải tệp lên.");
          return;
        }

        const placeholders = files.map((file) => ({
          uploadId: createUploadPlaceholderId(),
          file,
          kind: file.type.startsWith("video/") ? "video" : "image",
          label: file.type.startsWith("video/") ? "... đang tải video" : "... đang tải ảnh",
        }));

        editorInstance
          .chain()
          .focus()
          .insertContentAt(
            position ?? editorInstance.state.selection.from,
            placeholders.map((item) => ({
              type: "commentUploadPlaceholder",
              attrs: {
                uploadId: item.uploadId,
                kind: item.kind,
                label: item.label,
              },
            })),
          )
          .run();

        setIsUploadingMedia(true);
        onUploadingChangeRef.current?.(true);
        onErrorChangeRef.current?.(null);

        try {
          const nextPendingMedia: UploadedCommentMedia[] = [];

          for (const item of placeholders) {
            const file = item.file;
            const uploadedMedia = await commentService.uploadCommentMedia({
              entityType,
              entityId,
              file,
              currentProfileId,
            });

            const previewUrl = createPreviewUrl(file);
            const mediaWithPreview = {
              ...uploadedMedia,
              previewUrl,
            } satisfies UploadedCommentMedia;

            nextPendingMedia.push(mediaWithPreview);

            if (file.type.startsWith("video/")) {
              replacePlaceholderWithContent(editorInstance, item.uploadId, {
                type: "commentVideo",
                attrs: {
                  src: previewUrl,
                  filePath: mediaWithPreview.filePath,
                  fileName: mediaWithPreview.fileName,
                  mimeType: mediaWithPreview.mimeType,
                  fileSize: mediaWithPreview.fileSize,
                  bucket: mediaWithPreview.bucket,
                  externalUrl: null,
                  embedUrl: null,
                  provider: "upload",
                },
              });
            } else {
              replacePlaceholderWithContent(editorInstance, item.uploadId, {
                type: "image",
                attrs: {
                  src: previewUrl,
                  filePath: mediaWithPreview.filePath,
                  fileName: mediaWithPreview.fileName,
                  mimeType: mediaWithPreview.mimeType,
                  fileSize: mediaWithPreview.fileSize,
                  bucket: mediaWithPreview.bucket,
                  externalUrl: null,
                },
              });
            }
          }

          pendingMediaRef.current = [...pendingMediaRef.current, ...nextPendingMedia];
        } catch (uploadError) {
          placeholders.forEach((item) => {
            removePlaceholder(editorInstance, item.uploadId);
          });
          onErrorChangeRef.current?.(
            uploadError instanceof Error ? uploadError.message : "Không thể tải tệp lên.",
          );
        } finally {
          setIsUploadingMedia(false);
          onUploadingChangeRef.current?.(false);
        }
      },
      [currentProfileId, entityId, entityType],
    );

    const extensions = useMemo(
      () =>
        createCommentEditorExtensions({
          profiles,
          placeholder,
          editable: !disabled,
          onUploadFiles: uploadFilesToEditor,
        }),
      [disabled, placeholder, profiles, uploadFilesToEditor],
    );

    const editor = useEditor({
      extensions,
      content: initialDocument,
      immediatelyRender: false,
      editable: !disabled,
      editorProps: {
        attributes: {
          class: cn(
            "comment-rich-text comment-rich-text-editor min-h-[120px] rounded-b-2xl px-3 py-3 outline-none",
            disabled && "cursor-not-allowed bg-slate-50 text-slate-400",
          ),
        },
      },
      onCreate: ({ editor: nextEditor }) => {
        if (autoFocus) {
          nextEditor.commands.focus("end");
        }

        emitSnapshot(nextEditor);
      },
      onUpdate: ({ editor: nextEditor }) => {
        emitSnapshot(nextEditor);
      },
    });

    useEffect(() => {
      onUploadingChangeRef.current?.(isUploadingMedia);
    }, [isUploadingMedia]);

    useEffect(() => {
      if (!editor) {
        return;
      }

      editor.commands.setContent(JSON.parse(initialDocumentKey) as RichTextDocument);
      emitSnapshot(editor);
    }, [editor, emitSnapshot, initialDocumentKey]);

    useEffect(() => {
      onErrorChangeRef.current?.(null);
    }, [editor]);

    const resetPendingMedia = useCallback(() => {
      pendingMediaRef.current.forEach((media) => {
        if (media.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(media.previewUrl);
        }
      });
      pendingMediaRef.current = [];
    }, []);

    const cleanupAllPendingMedia = useCallback(async () => {
      if (!editor) {
        resetPendingMedia();
        return;
      }

      const filePaths = pendingMediaRef.current.map((media) => media.filePath);
      await cleanupMedia(filePaths);

      const nextDocument = removeMediaNodesByFilePaths(
        normalizeRichTextDocumentForStorage(editor.getJSON() as RichTextDocument),
        filePaths,
      );
      editor.commands.setContent(nextDocument);
      emitSnapshot(editor);
    }, [cleanupMedia, editor, emitSnapshot, resetPendingMedia]);

    const cleanupUnreferencedPendingMedia = useCallback(async () => {
      if (!editor) {
        return;
      }

      const document = normalizeRichTextDocumentForStorage(editor.getJSON() as RichTextDocument);
      const referencedPaths = collectCommentAttachmentsFromDocument(document).map(
        (attachment) => attachment.filePath,
      );

      const stalePaths = pendingMediaRef.current
        .map((media) => media.filePath)
        .filter((filePath) => !referencedPaths.includes(filePath));

      await cleanupMedia(stalePaths);
      emitSnapshot(editor);
    }, [cleanupMedia, editor, emitSnapshot]);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          if (!editor) {
            return;
          }

          editor.commands.setContent(createEmptyRichTextDocument());
          emitSnapshot(editor);
        },
        focus: () => {
          editor?.commands.focus("end");
        },
        cleanupAllPendingMedia,
        cleanupUnreferencedPendingMedia,
        resetPendingMedia,
      }),
      [cleanupAllPendingMedia, cleanupUnreferencedPendingMedia, editor, emitSnapshot, resetPendingMedia],
    );

    const triggerImageUpload = () => {
      imageInputRef.current?.click();
    };

    const triggerVideoUpload = () => {
      videoInputRef.current?.click();
      setIsVideoPopoverOpen(false);
    };

    const handleFileInputChange = async (
      event: React.ChangeEvent<HTMLInputElement>,
      mediaType: "image" | "video",
    ) => {
      const files = Array.from(event.target.files ?? []).filter((file) =>
        mediaType === "image" ? file.type.startsWith("image/") : file.type.startsWith("video/"),
      );

      event.target.value = "";

      if (files.length === 0 || !editor) {
        return;
      }

      await uploadFilesToEditor(editor, files);
    };

    const handleLinkAction = () => {
      if (!editor) {
        return;
      }

      const previousUrl = editor.getAttributes("link").href as string | undefined;
      const nextUrl = window.prompt("Nhập liên kết", previousUrl ?? "");
      if (nextUrl === null) {
        return;
      }

      if (!nextUrl.trim()) {
        editor.chain().focus().unsetLink().run();
        return;
      }

      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: nextUrl.trim() })
        .run();
    };

    const handleInsertVideoLink = () => {
      if (!editor) {
        return;
      }

      const payload = resolveVideoLinkPayload(videoLink);
      if (!payload) {
        return;
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: "commentVideo",
          attrs: {
            src: payload.embedUrl ?? payload.src,
            filePath: null,
            fileName: "video",
            mimeType: null,
            fileSize: null,
            bucket: null,
            externalUrl: payload.src,
            embedUrl: payload.embedUrl,
            provider: payload.provider,
          },
        })
        .run();

      setVideoLink("");
      setIsVideoPopoverOpen(false);
    };

    if (!editor) {
      return null;
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={disabled}
            className={cn(editor.isActive("bold") && "border-slate-300 bg-slate-200")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={disabled}
            className={cn(editor.isActive("italic") && "border-slate-300 bg-slate-200")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            disabled={disabled}
            className={cn(editor.isActive("underline") && "border-slate-300 bg-slate-200")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={disabled}
            className={cn(editor.isActive("bulletList") && "border-slate-300 bg-slate-200")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            disabled={disabled}
            className={cn(editor.isActive("orderedList") && "border-slate-300 bg-slate-200")}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLinkAction}
            disabled={disabled}
            className={cn(editor.isActive("link") && "border-slate-300 bg-slate-200")}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={triggerImageUpload} disabled={disabled}>
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Popover open={isVideoPopoverOpen} onOpenChange={setIsVideoPopoverOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={disabled}>
                <Video className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3">
              <div className="space-y-3">
                <Button type="button" variant="outline" className="w-full" onClick={triggerVideoUpload}>
                  Tải video
                </Button>
                <div className="space-y-2">
                  <input
                    value={videoLink}
                    onChange={(event) => setVideoLink(event.target.value)}
                    placeholder="Dán link video"
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <Button type="button" className="w-full" onClick={handleInsertVideoLink}>
                    Chèn video
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <EditorContent editor={editor} />

        <input
          ref={imageInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          className="hidden"
          onChange={(event) => void handleFileInputChange(event, "image")}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept={ACCEPTED_VIDEO_TYPES}
          multiple
          className="hidden"
          onChange={(event) => void handleFileInputChange(event, "video")}
        />
      </div>
    );
  },
);
