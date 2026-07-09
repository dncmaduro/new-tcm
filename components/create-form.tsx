"use client";

import { type ComponentProps, type ReactNode } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { cn } from "@/lib/utils";

type SidebarActiveKey = ComponentProps<typeof WorkspaceSidebar>["active"];
type BreadcrumbItem = NonNullable<ComponentProps<typeof WorkspacePageHeader>["items"]>[number];

export function CreateFormPage({
  sidebarActive,
  title,
  items,
  topSlot,
  children,
}: {
  sidebarActive: SidebarActiveKey;
  title: string;
  items: BreadcrumbItem[];
  topSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active={sidebarActive} />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden bg-[#f3f5fa] lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader title={title} items={items} />

          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5fa] px-4 py-5 lg:px-7">
            {topSlot}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function CreateFormShell({
  title,
  contextBar,
  footer,
  children,
  className,
}: {
  title: string;
  contextBar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[980px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-5",
        className,
      )}
    >
      <div className="space-y-5">
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{title}</h1>
          {contextBar}
        </div>

        <div className="space-y-5">{children}</div>
        {footer}
      </div>
    </section>
  );
}

export function FormContextBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3", className)}>
      <div className="text-sm text-slate-500">{children}</div>
    </div>
  );
}

export function FormSection({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function FormFieldGrid({
  columns = "two",
  children,
  className,
}: {
  columns?: "two" | "four";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === "four" ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormFooterActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-slate-200 pt-4", className)}>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}
