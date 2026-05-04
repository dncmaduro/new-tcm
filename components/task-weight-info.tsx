"use client";

import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TaskWeightInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Giải thích trọng số task"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          <InfoCircledIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3 text-xs leading-5 text-slate-600" align="start">
        Trọng số task là tỷ trọng của task trong KR. Tỷ lệ càng cao thì task càng quan trọng và ảnh hưởng lên
        hiệu suất nhân viên càng lớn.
      </PopoverContent>
    </Popover>
  );
}
