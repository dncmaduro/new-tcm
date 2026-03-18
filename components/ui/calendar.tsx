"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col",
        month: "space-y-3",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-sm font-semibold text-slate-800",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        button_next:
          "absolute right-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        chevron: "h-4 w-4",
        weekdays: "flex",
        weekday: "h-9 w-9 text-center text-xs font-semibold text-slate-500",
        weeks: "flex flex-col gap-1",
        week: "mt-1 flex w-full",
        month_grid: "w-full border-collapse",
        day: "h-9 w-9 p-0 text-center align-middle",
        day_button:
          "h-9 w-9 rounded-md p-0 text-sm text-slate-700 hover:bg-slate-100 aria-selected:bg-blue-600 aria-selected:text-white",
        today: "text-blue-700 font-semibold",
        outside: "text-slate-300 opacity-50",
        disabled: "text-slate-300 opacity-50",
        selected: "bg-blue-600 text-white hover:bg-blue-600 focus:bg-blue-600",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
