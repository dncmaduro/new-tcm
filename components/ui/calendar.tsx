"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        root: "w-full",
        months: "flex w-full flex-col",
        month: "w-full space-y-3",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-sm font-semibold text-slate-800",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        button_next:
          "absolute right-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        chevron: "h-4 w-4",
        weekdays: "grid grid-cols-7",
        weekday: "text-center text-xs font-semibold text-slate-500",
        month_grid: "mt-2 grid grid-cols-7 gap-1",
        day: "flex items-center justify-center",
        day_button:
          "h-9 w-9 rounded-md text-sm text-slate-700 hover:bg-slate-100 aria-selected:bg-blue-600 aria-selected:text-white",
        today: "text-blue-700 font-semibold",
        outside: "text-slate-300",
        disabled: "text-slate-300",
        selected: "bg-blue-600 text-white hover:bg-blue-600",
        ...classNames,
      }}
      {...props}
    />
  );
}
