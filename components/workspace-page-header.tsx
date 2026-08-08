"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { NotificationCenter } from "@/components/notification-center";

type WorkspacePageHeaderItem = {
  label: string;
  href?: string;
};

type WorkspacePageHeaderProps = {
  title: string;
  items?: WorkspacePageHeaderItem[];
  compact?: boolean;
  actions?: ReactNode;
};

export function WorkspacePageHeader({
  title,
  items = [],
  compact = true,
  actions,
}: WorkspacePageHeaderProps) {
  const breadcrumbs: WorkspacePageHeaderItem[] = [
    { label: "Chấm công", href: "/timesheet" },
    ...items,
  ];

  return (
    <header
      className={`sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 backdrop-blur ${
        compact ? "px-4 py-3 lg:px-6" : "px-4 py-5 lg:px-7"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`${compact ? "text-xs" : "text-sm"} font-semibold text-gray-500`}>
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`}>
                {index > 0 ? <span className="px-2">›</span> : null}
                {item.href ? (
                  <Link href={item.href} className="hover:text-gray-900">
                    {item.label}
                  </Link>
                ) : (
                  <span>{item.label}</span>
                )}
              </span>
            ))}
          </p>
          <h1
            className={`font-bold tracking-[-0.03em] text-slate-900 ${
              compact ? "mt-1 text-2xl" : "mt-2 text-4xl"
            }`}
          >
            {title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {actions}
          <NotificationCenter />
        </div>
      </div>
    </header>
  );
}
