"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";
import type { MentionedProfile } from "./types";

export type MentionSuggestionListHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type MentionSuggestionListProps = {
  items: MentionedProfile[];
  command: (profile: MentionedProfile) => void;
};

const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

export const MentionSuggestionList = forwardRef<
  MentionSuggestionListHandle,
  MentionSuggestionListProps
>(function MentionSuggestionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex =
    items.length === 0 ? 0 : Math.min(selectedIndex, Math.max(0, items.length - 1));

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (items.length === 0) {
        return false;
      }

      if (event.key === "ArrowUp") {
        setSelectedIndex((current) => (current + items.length - 1) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((current) => (current + 1) % items.length);
        return true;
      }

      if (event.key === "Enter") {
        selectItem(activeIndex);
        return true;
      }

      return false;
    },
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="max-h-64 min-w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.4)]">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectItem(index)}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2 text-left transition",
            index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50",
          )}
        >
          {item.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.avatar} alt={item.name} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {getInitial(item.name)}
            </span>
          )}
          <span className="text-sm font-medium text-slate-700">{item.name}</span>
        </button>
      ))}
    </div>
  );
});
