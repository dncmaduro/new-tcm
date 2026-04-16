"use client";

import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function KeyResultContributionInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Giải thích kiểu đóng góp"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600"
        >
          <InfoCircledIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] space-y-2 p-3 text-xs text-slate-600" align="start">
        <div>
          <p className="font-semibold text-slate-800">Trực tiếp</p>
          <p className="mt-1">
            KR đóng góp trực tiếp vào chỉ số hoặc kết quả kinh doanh chính của mục tiêu.
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-800">Hỗ trợ</p>
          <p className="mt-1">
            KR hỗ trợ cho KR trực tiếp qua liên kết hỗ trợ, không tự hiểu là chỉ số business tổng.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
