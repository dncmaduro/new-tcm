"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckboxIcon,
  DashboardIcon,
  RocketIcon,
  ClockIcon,
  GearIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  FileText,
  Gauge,
  ListTodo,
  ShieldCheck,
  Target,
  Timer,
  UserCircle2,
} from "lucide-react";
import { type ReactNode, type RefObject, ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import { useWorkspaceSidebarStore } from "@/lib/stores/workspace-sidebar-store";
import { useWorkspaceAccess, useWorkspaceAccessStore } from "@/lib/stores/workspace-access-store";

type SidebarKey =
  | "dashboard"
  | "goals"
  | "tasks"
  | "realtimeReports"
  | "timesheet"
  | "timeRequestForms"
  | "attendanceManagement"
  | "timeRequestManagement"
  | "reports"
  | "departments"
  | "departmentPerformance"
  | "profile";

type WorkspaceSidebarProps = {
  active: SidebarKey;
};

type SidebarIcon = ComponentType<{ className?: string }>;
type SidebarItem = { key: SidebarKey; label: string; href: string };
type CollapsedGroupKey = "work" | "time" | "management";

const dashboardItem: { key: SidebarKey; label: string; href: string; icon: SidebarIcon } = {
  key: "dashboard",
  label: "Bảng điều khiển",
  href: "/dashboard",
  icon: DashboardIcon,
};

const workSidebarItems: SidebarItem[] = [
  { key: "goals", label: "Mục tiêu", href: "/goals" },
  { key: "tasks", label: "Công việc", href: "/tasks" },
  { key: "reports", label: "Báo cáo", href: "/reports" },
];

const timeSidebarItems: SidebarItem[] = [
  { key: "timesheet", label: "Chấm công", href: "/timesheet" },
  { key: "timeRequestForms", label: "Yêu cầu thời gian", href: "/timesheet/requests" },
];

const managementSidebarItems: SidebarItem[] = [
  { key: "realtimeReports", label: "Quản lý hiệu suất", href: "/reports/realtime" },
  { key: "attendanceManagement", label: "Quản lý chấm công", href: "/attendance-management" },
  {
    key: "timeRequestManagement",
    label: "Quản lý yêu cầu thời gian",
    href: "/time-request-management",
  },
];

const SIDEBAR_EXPANDED_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 88;

const getSidebarItemIcon = (key: SidebarKey): ComponentType<{ className?: string }> => {
  if (key === "goals") return Target;
  if (key === "tasks") return ListTodo;
  if (key === "reports") return FileText;
  if (key === "timesheet") return CalendarDays;
  if (key === "timeRequestForms") return ClipboardList;
  if (key === "realtimeReports") return Activity;
  if (key === "attendanceManagement") return ShieldCheck;
  if (key === "timeRequestManagement") return Timer;
  if (key === "departments") return GearIcon;
  if (key === "departmentPerformance") return Gauge;
  if (key === "profile") return UserCircle2;
  return DashboardIcon;
};

function SidebarBadge() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500">
      <RocketIcon className="h-4 w-4 text-white" />
    </div>
  );
}

function SidebarTooltip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarGroup({
  label,
  icon: GroupIcon,
  items,
  isOpen,
  onOpenChange,
  onCollapsedOpen,
  menuRef,
  isCollapsed,
  isGroupActive,
  active,
  onParentClick,
}: {
  label: string;
  icon: SidebarIcon;
  items: SidebarItem[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCollapsedOpen: (open: boolean) => void;
  menuRef?: RefObject<HTMLDivElement | null>;
  isCollapsed: boolean;
  isGroupActive: boolean;
  active: SidebarKey;
  onParentClick?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(0);

  if (isCollapsed) {
    return (
      <div ref={menuRef} className="relative">
        <SidebarTooltip label={label} enabled>
          <button
            ref={triggerRef}
            type="button"
            title={label}
            onClick={() => {
              onParentClick?.();
              const nextOpen = !isOpen;
              if (nextOpen) {
                const rect = triggerRef.current?.getBoundingClientRect();
                if (rect) {
                  setFlyoutTop(rect.top);
                }
              }
              onCollapsedOpen(nextOpen);
            }}
            className={`flex w-full items-center justify-center rounded-xl px-0 py-3 text-left font-medium tracking-[-0.01em] transition ${
              isGroupActive || isOpen
                ? "bg-[#0b1e43] text-white"
                : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
            } ${isOpen ? "ring-1 ring-blue-400/30" : ""}`}
          >
            <GroupIcon className="h-[18px] w-[18px] shrink-0" />
          </button>
        </SidebarTooltip>

        {isOpen ? (
          <div
            className="fixed z-[9999] w-64 rounded-xl border border-slate-700 bg-[#0d234f] p-2 shadow-2xl"
            style={{
              left: "calc(var(--workspace-sidebar-width) + 12px)",
              top: flyoutTop,
            }}
          >
            <div className="mb-2 rounded-xl bg-[#12306b] px-3 py-2">
              <p className="text-sm font-semibold text-white">{label}</p>
            </div>
            {items.map((item) => {
              const ItemIcon = getSidebarItemIcon(item.key);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => onCollapsedOpen(false)}
                  className={`mb-1 flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition last:mb-0 ${
                    item.key === active
                      ? "bg-[#1e62d8] text-white"
                      : "text-slate-100 hover:bg-[#12306b]"
                  }`}
                >
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange} className="space-y-2">
      <SidebarTooltip label={label} enabled={false}>
        <CollapsibleTrigger
          title={label}
          onClick={onParentClick}
          className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-lg font-medium tracking-[-0.01em] transition ${
            isGroupActive
              ? "bg-[#0b1e43] text-white"
              : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
          }`}
        >
          <span className="flex items-center gap-3">
            <GroupIcon className="h-[18px] w-[18px] shrink-0" />
            {label}
          </span>
          {isOpen ? (
            <ChevronUpIcon className="h-4 w-4 text-slate-300" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-slate-300" />
          )}
        </CollapsibleTrigger>
      </SidebarTooltip>

      <CollapsibleContent className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`ml-5 flex w-[calc(100%-1.25rem)] items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              item.key === active
                ? "bg-[#1e62d8] text-white"
                : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toRolePriority = (roleName: string) => {
  const normalized = normalizeText(roleName);
  if (normalized.includes("giam doc") || normalized.includes("director")) {
    return 0;
  }
  if (
    normalized.includes("leader") ||
    normalized.includes("truong nhom") ||
    normalized.includes("manager")
  ) {
    return 1;
  }
  if (normalized.includes("member") || normalized.includes("thanh vien")) {
    return 2;
  }
  return 3;
};

export function WorkspaceSidebar({ active }: WorkspaceSidebarProps) {
  const router = useRouter();
  const workspaceAccess = useWorkspaceAccess();
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const workMenuRef = useRef<HTMLDivElement | null>(null);
  const timeMenuRef = useRef<HTMLDivElement | null>(null);
  const managementMenuRef = useRef<HTMLDivElement | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const isCollapsed = useWorkspaceSidebarStore((state) => state.isCollapsed);
  const hydrateSidebarFromStorage = useWorkspaceSidebarStore((state) => state.hydrateFromStorage);
  const toggleSidebarCollapsed = useWorkspaceSidebarStore((state) => state.toggleCollapsed);
  const [isWorkMenuOpen, setIsWorkMenuOpen] = useState(false);
  const [isTimeMenuOpen, setIsTimeMenuOpen] = useState(false);
  const [isManagementMenuOpen, setIsManagementMenuOpen] = useState(false);
  const [openCollapsedGroup, setOpenCollapsedGroup] = useState<CollapsedGroupKey | null>(null);

  useEffect(() => {
    hydrateSidebarFromStorage();
  }, [hydrateSidebarFromStorage]);

  useEffect(() => {
    const sidebarWidth = `${isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH}px`;
    document.documentElement.style.setProperty("--workspace-sidebar-width", sidebarWidth);
  }, [isCollapsed]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }

      if (!isCollapsed || openCollapsedGroup === null) {
        return;
      }

      const clickedInsideGroupMenu =
        workMenuRef.current?.contains(target) ||
        timeMenuRef.current?.contains(target) ||
        managementMenuRef.current?.contains(target);

      if (!clickedInsideGroupMenu) {
        setOpenCollapsedGroup(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isCollapsed, openCollapsedGroup]);

  const visibleManagementItems = managementSidebarItems.filter((item) => {
    if (item.key === "realtimeReports") {
      return workspaceAccess.hasDirectorRole || workspaceAccess.hasRootLeaderAccess;
    }
    if (item.key === "attendanceManagement") {
      return workspaceAccess.canManage;
    }
    return true;
  });
  const workGroupActive = workSidebarItems.some((item) => item.key === active);
  const timeGroupActive = timeSidebarItems.some((item) => item.key === active);
  const managementGroupActive = visibleManagementItems.some((item) => item.key === active);

  const sidebarName = useMemo(() => {
    const profileName = workspaceAccess.profileName?.trim();
    if (profileName) {
      return profileName;
    }
    if (workspaceAccess.authEmail) {
      return String(workspaceAccess.authEmail).split("@")[0];
    }
    return "Người dùng";
  }, [workspaceAccess.authEmail, workspaceAccess.profileName]);

  const primaryAssignment = useMemo(() => {
    const roleNameById = workspaceAccess.roles.reduce<Record<string, string>>((acc, role) => {
      acc[role.id] = role.name?.trim() || "Chưa gán vai trò";
      return acc;
    }, {});
    const departmentNameById = workspaceAccess.departments.reduce<Record<string, string>>(
      (acc, department) => {
        acc[department.id] = department.name || "Không rõ phòng ban";
        return acc;
      },
      {},
    );

    return workspaceAccess.memberships
      .map((membership) => ({
        roleName: membership.roleId
          ? (roleNameById[membership.roleId] ?? "Chưa gán vai trò")
          : "Chưa gán vai trò",
        departmentName: membership.departmentId
          ? (departmentNameById[membership.departmentId] ?? "Không rõ phòng ban")
          : "Không thuộc phòng ban",
      }))
      .sort((a, b) => {
        const byPriority = toRolePriority(a.roleName) - toRolePriority(b.roleName);
        if (byPriority !== 0) {
          return byPriority;
        }
        const byRole = a.roleName.localeCompare(b.roleName, "vi");
        if (byRole !== 0) {
          return byRole;
        }
        return a.departmentName.localeCompare(b.departmentName, "vi");
      })[0];
  }, [workspaceAccess.departments, workspaceAccess.memberships, workspaceAccess.roles]);

  const sidebarRole = primaryAssignment?.roleName ?? "Chưa có vai trò";
  const sidebarDepartment = primaryAssignment?.departmentName ?? "Chưa có phòng ban";
  const sidebarInitial = useMemo(() => {
    const trimmed = sidebarName.trim();
    if (!trimmed) {
      return "U";
    }

    return (
      trimmed
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || trimmed.slice(0, 1).toUpperCase()
    );
  }, [sidebarName]);

  useEffect(() => {
    setIsWorkMenuOpen(workGroupActive);
    setIsTimeMenuOpen(timeGroupActive);
    setIsManagementMenuOpen(managementGroupActive);
  }, [managementGroupActive, timeGroupActive, workGroupActive]);

  useEffect(() => {
    setOpenCollapsedGroup(null);
  }, [isCollapsed]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setLogoutError("Không thể đăng xuất lúc này. Vui lòng thử lại.");
        return;
      }

      useWorkspaceAccessStore.getState().reset();
      setIsUserMenuOpen(false);
      router.replace("/");
      router.refresh();
    } catch {
      setLogoutError("Không thể đăng xuất lúc này. Vui lòng thử lại.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <TooltipProvider>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col overflow-visible bg-[#081633] text-slate-100 transition-[width,padding] duration-200 lg:flex"
        style={{
          width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
          paddingLeft: isCollapsed ? 12 : 20,
          paddingRight: isCollapsed ? 12 : 20,
        }}
      >
        <div className="flex h-full flex-col overflow-visible pb-15 pt-6">
          <div className={`mb-8 flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
            <SidebarBadge />
            {!isCollapsed ? (
              <div>
                <p className="text-2xl font-semibold tracking-[-0.02em]">TCM</p>
                <p className="text-sm text-slate-400">Nền tảng quản trị</p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              toggleSidebarCollapsed();
              setIsUserMenuOpen(false);
              setOpenCollapsedGroup(null);
            }}
            title={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            className={`mb-4 flex h-10 items-center rounded-xl border border-slate-700 bg-[#0d234f] text-sm font-semibold text-slate-100 transition hover:bg-[#12306b] ${
              isCollapsed ? "justify-center px-0" : "justify-between px-3"
            }`}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="h-4 w-4" />
            ) : (
              <>
                <span>Thu gọn</span>
                <ChevronLeftIcon className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto overflow-x-visible">
            <nav className="space-y-2">
              <SidebarTooltip label={dashboardItem.label} enabled={isCollapsed}>
                <Link
                  href={dashboardItem.href}
                  title={dashboardItem.label}
                  className={`flex w-full items-center rounded-xl text-left font-medium tracking-[-0.01em] transition ${
                    isCollapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3 text-lg"
                  } ${
                    dashboardItem.key === active
                      ? "bg-[#1e62d8] text-white"
                      : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                  }`}
                >
                  <DashboardIcon className="h-[18px] w-[18px] shrink-0" />
                  {!isCollapsed ? dashboardItem.label : null}
                </Link>
              </SidebarTooltip>

              <SidebarGroup
                label="Công việc"
                icon={CheckboxIcon}
                items={workSidebarItems}
                active={active}
                isOpen={isCollapsed ? openCollapsedGroup === "work" : isWorkMenuOpen}
                onOpenChange={setIsWorkMenuOpen}
                onCollapsedOpen={(open) => {
                  setOpenCollapsedGroup(open ? "work" : null);
                }}
                menuRef={workMenuRef}
                isCollapsed={isCollapsed}
                isGroupActive={workGroupActive}
                onParentClick={() => setIsUserMenuOpen(false)}
              />

              <SidebarGroup
                label="Thời gian"
                icon={ClockIcon}
                items={timeSidebarItems}
                active={active}
                isOpen={isCollapsed ? openCollapsedGroup === "time" : isTimeMenuOpen}
                onOpenChange={setIsTimeMenuOpen}
                onCollapsedOpen={(open) => {
                  setOpenCollapsedGroup(open ? "time" : null);
                }}
                menuRef={timeMenuRef}
                isCollapsed={isCollapsed}
                isGroupActive={timeGroupActive}
                onParentClick={() => setIsUserMenuOpen(false)}
              />

              {visibleManagementItems.length > 0 ? (
                <SidebarGroup
                  label="Quản lý"
                  icon={GearIcon}
                  items={visibleManagementItems}
                  active={active}
                  isOpen={isCollapsed ? openCollapsedGroup === "management" : isManagementMenuOpen}
                  onOpenChange={setIsManagementMenuOpen}
                  onCollapsedOpen={(open) => {
                    setOpenCollapsedGroup(open ? "management" : null);
                  }}
                  menuRef={managementMenuRef}
                  isCollapsed={isCollapsed}
                  isGroupActive={managementGroupActive}
                  onParentClick={() => setIsUserMenuOpen(false)}
                />
              ) : null}
            </nav>
          </div>

          <div className="mt-4 space-y-4 overflow-visible">
            <div ref={userMenuRef} className="relative overflow-visible">
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen((prev) => !prev);
                  setLogoutError(null);
                }}
                title={sidebarName}
                className={`flex w-full items-center rounded-xl bg-[#0d234f] p-3 text-left transition hover:bg-[#12306b] ${
                  isCollapsed ? "justify-center" : "justify-start gap-3"
                }`}
              >
                {isCollapsed ? (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#12306b] text-sm font-semibold text-white">
                    {sidebarInitial}
                  </span>
                ) : (
                  <>
                    <div>
                      <p className="text-base font-semibold">{sidebarName}</p>
                      <p className="text-sm text-slate-400">
                        {sidebarRole} · {sidebarDepartment}
                      </p>
                    </div>
                  </>
                )}
              </button>

              {isUserMenuOpen ? (
                <div className="absolute left-[calc(100%+0.75rem)] top-1/2 z-[60] w-[240px] -translate-y-1/2 rounded-xl border border-slate-700 bg-[#0d234f] p-2 shadow-2xl animate-[sidebar-popout-fade-in_140ms_ease-out]">
                  {isCollapsed ? (
                    <div className="mb-2 rounded-xl bg-[#12306b] px-3 py-2">
                      <p className="text-sm font-semibold text-white">{sidebarName}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {sidebarRole} · {sidebarDepartment}
                      </p>
                    </div>
                  ) : null}
                  <Link
                    href="/profile"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="mb-1 flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-slate-100 transition hover:bg-[#12306b]"
                  >
                    Hồ sơ
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex h-9 w-full items-center rounded-lg px-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
                  </button>
                  {logoutError ? (
                    <p className="mt-1 rounded-lg border border-rose-300/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                      {logoutError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
