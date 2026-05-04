"use client";

import Link from "next/link";

type WorkspacePageHeaderItem = {
  label: string;
  href?: string;
};

type WorkspacePageHeaderProps = {
  title: string;
  items?: WorkspacePageHeaderItem[];
};

export function WorkspacePageHeader({
  title,
  items = [],
}: WorkspacePageHeaderProps) {
  const breadcrumbs: WorkspacePageHeaderItem[] = [
    { label: "Bảng điều khiển", href: "/dashboard" },
    ...items,
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-5 backdrop-blur lg:px-7">
      <div>
        <p className="text-sm font-semibold text-gray-500">
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
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.03em] text-slate-900">
          {title}
        </h1>
      </div>
    </header>
  );
}
