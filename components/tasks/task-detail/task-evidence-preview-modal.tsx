"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TaskEvidencePreviewModalProps = {
  open: boolean;
  title: string;
  kind: "image" | "video" | "pdf" | null;
  url: string | null;
  onOpenChange: (open: boolean) => void;
};

export function TaskEvidencePreviewModal({
  open,
  title,
  kind,
  url,
  onOpenChange,
}: TaskEvidencePreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] min-h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
          {kind === "image" && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={title}
              className="max-h-[70vh] max-w-full object-contain"
            />
          ) : null}

          {kind === "video" && url ? (
            <video
              src={url}
              controls
              className="max-h-[70vh] max-w-full"
            />
          ) : null}

          {kind === "pdf" && url ? (
            <iframe
              src={url}
              title={title}
              className="h-[70vh] w-full rounded-2xl border-0 bg-white"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
