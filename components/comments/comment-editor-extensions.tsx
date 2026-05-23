"use client";

import type { ComponentProps } from "react";
import { mergeAttributes, Node, type AnyExtension, type Editor } from "@tiptap/core";
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance, type Props } from "tippy.js";
import { MentionSuggestionList, type MentionSuggestionListHandle } from "./mention-suggestion-list";
import type { MentionedProfile } from "./types";

type CreateCommentEditorExtensionsOptions = {
  getProfiles: () => MentionedProfile[];
  placeholder?: string;
  editable?: boolean;
  openLinksOnClick?: boolean;
  onUploadFiles?: (editor: Editor, files: File[], position?: number) => Promise<void>;
};

type VideoLinkPayload = {
  src: string;
  embedUrl: string | null;
  provider: "upload" | "embed" | "external";
};

const ACCEPTED_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

const CommentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      filePath: {
        default: null,
      },
      fileName: {
        default: null,
      },
      mimeType: {
        default: null,
      },
      fileSize: {
        default: null,
      },
      bucket: {
        default: "comment_media_files",
      },
      externalUrl: {
        default: null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "comment-rich-image",
      }),
    ];
  },
});

export const CommentVideo = Node.create({
  name: "commentVideo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      filePath: {
        default: null,
      },
      fileName: {
        default: null,
      },
      mimeType: {
        default: null,
      },
      fileSize: {
        default: null,
      },
      bucket: {
        default: "comment_media_files",
      },
      externalUrl: {
        default: null,
      },
      embedUrl: {
        default: null,
      },
      provider: {
        default: "upload",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "video[data-comment-video]",
      },
      {
        tag: "div[data-comment-video-embed]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const embedUrl =
      typeof HTMLAttributes.embedUrl === "string" ? HTMLAttributes.embedUrl : null;
    const src = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : null;

    if (embedUrl) {
      return [
        "div",
        {
          "data-comment-video-embed": "true",
          class: "comment-rich-video-embed",
        },
        [
          "iframe",
          {
            src: embedUrl,
            allowfullscreen: "true",
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            referrerpolicy: "strict-origin-when-cross-origin",
          },
        ],
      ];
    }

    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        "data-comment-video": "true",
        class: "comment-rich-video",
        controls: "true",
        src,
      }),
    ];
  },
});

export const CommentUploadPlaceholder = Node.create({
  name: "commentUploadPlaceholder",
  group: "block",
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      uploadId: {
        default: null,
      },
      kind: {
        default: "image",
      },
      label: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-comment-upload-placeholder]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const label =
      typeof HTMLAttributes.label === "string" && HTMLAttributes.label.trim()
        ? HTMLAttributes.label
        : HTMLAttributes.kind === "video"
          ? "... đang tải video"
          : "... đang tải ảnh";

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-comment-upload-placeholder": "true",
        class: "comment-upload-placeholder",
      }),
      label,
    ];
  },
});

const buildMentionExtension = (
  getProfiles: () => MentionedProfile[],
  isEditable: boolean,
) =>
  Mention.configure({
    HTMLAttributes: {
      class: "comment-mention",
    },
    renderText({ options, node }) {
      return `${options.suggestion.char}${node.attrs.label ?? ""}`;
    },
    renderHTML({ options, node }) {
      return [
        "span",
        mergeAttributes(options.HTMLAttributes, {
          "data-mention-id": node.attrs.id,
          class: "comment-mention",
        }),
        `${options.suggestion.char}${node.attrs.label ?? ""}`,
      ];
    },
    suggestion: {
      char: "@",
      items: ({ query }) => {
        const normalizedQuery = query.trim().toLocaleLowerCase("vi");
        const profiles = getProfiles();

        return profiles
          .filter((profile) =>
            normalizedQuery
              ? profile.name.toLocaleLowerCase("vi").includes(normalizedQuery)
              : true,
          )
          .slice(0, 8);
      },
      command: ({ editor, range, props }) => {
        const profile = props as MentionedProfile;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "mention",
              attrs: {
                id: profile.id,
                label: profile.name,
              },
            },
            {
              type: "text",
              text: " ",
            },
          ])
          .run();
      },
      render: isEditable
        ? () => {
            let popup:
              | Instance<Props>
              | undefined;
            let reactRenderer:
              | ReactRenderer<MentionSuggestionListHandle, ComponentProps<typeof MentionSuggestionList>>
              | undefined;

            return {
              onStart: (props: SuggestionProps<MentionedProfile, MentionedProfile>) => {
                reactRenderer = new ReactRenderer(MentionSuggestionList, {
                  props: {
                    items: props.items,
                    command: props.command,
                  },
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy(document.body, {
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                  appendTo: () => document.body,
                  content: reactRenderer.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },

              onUpdate(props: SuggestionProps<MentionedProfile, MentionedProfile>) {
                reactRenderer?.updateProps({
                  items: props.items,
                  command: props.command,
                });

                if (!props.clientRect) {
                  return;
                }

                popup?.setProps({
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                });
              },

              onKeyDown(props: SuggestionKeyDownProps) {
                if (props.event.key === "Escape") {
                  popup?.hide();
                  return true;
                }

                return reactRenderer?.ref?.onKeyDown(props.event) ?? false;
              },

              onExit() {
                popup?.destroy();
                reactRenderer?.destroy();
              },
            };
          }
        : undefined,
    },
  });

export const createCommentEditorExtensions = ({
  getProfiles,
  placeholder,
  editable = true,
  openLinksOnClick = false,
  onUploadFiles,
}: CreateCommentEditorExtensionsOptions) => {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
    }),
    Underline,
    Link.configure({
      openOnClick: openLinksOnClick,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
    }),
    CommentImage,
    CommentVideo,
    CommentUploadPlaceholder,
    buildMentionExtension(getProfiles, editable),
  ];

  if (editable && placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder,
      }),
    );
  }

  if (editable && onUploadFiles) {
    extensions.push(
      FileHandler.configure({
        allowedMimeTypes: ACCEPTED_MEDIA_MIME_TYPES,
        onPaste: async (editor, files) => {
          await onUploadFiles(editor, files, editor.state.selection.from);
        },
        onDrop: async (editor, files, position) => {
          await onUploadFiles(editor, files, position);
        },
      }),
    );
  }

  return extensions;
};

const YOUTUBE_PATTERNS = [
  /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([^&]+)/i,
  /https?:\/\/(?:www\.)?youtu\.be\/([^?&]+)/i,
  /https?:\/\/(?:www\.)?youtube\.com\/shorts\/([^?&]+)/i,
];

const VIMEO_PATTERN = /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i;

export const resolveVideoLinkPayload = (value: string): VideoLinkPayload | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  for (const pattern of YOUTUBE_PATTERNS) {
    const match = trimmedValue.match(pattern);
    if (match?.[1]) {
      return {
        src: trimmedValue,
        embedUrl: `https://www.youtube.com/embed/${match[1]}`,
        provider: "embed",
      };
    }
  }

  const vimeoMatch = trimmedValue.match(VIMEO_PATTERN);
  if (vimeoMatch?.[1]) {
    return {
      src: trimmedValue,
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      provider: "embed",
    };
  }

  return {
    src: trimmedValue,
    embedUrl: null,
    provider: "external",
  };
};
