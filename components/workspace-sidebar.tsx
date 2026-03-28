"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChartIcon,
  CheckboxIcon,
  DashboardIcon,
  GroupIcon,
  RocketIcon,
  TargetIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/lib/supabase";
import { useWorkspaceSidebarStore } from "@/lib/stores/workspace-sidebar-store";
import { useWorkspaceAccess, useWorkspaceAccessStore } from "@/lib/stores/workspace-access-store";

type SidebarKey =
  | "dashboard"
  | "goals"
  | "tasks"
  | "timesheet"
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

const sidebarItems: Array<{ key: SidebarKey; label: string; href: string; icon: SidebarIcon }> = [
  { key: "dashboard", label: "Bảng điều khiển", href: "/dashboard", icon: DashboardIcon },
  { key: "goals", label: "Mục tiêu", href: "/goals", icon: TargetIcon },
  { key: "tasks", label: "Công việc", href: "/tasks", icon: CheckboxIcon },
  { key: "timesheet", label: "Chấm công", href: "/timesheet", icon: ClockIcon },
  { key: "reports", label: "Báo cáo", href: "/reports", icon: BarChartIcon },
  { key: "departmentPerformance", label: "Hiệu suất phòng ban", href: "/department-performance", icon: BarChartIcon },
  { key: "departments", label: "Phòng ban", href: "/departments", icon: GroupIcon },
];

const managementSidebarItems: Array<{ key: SidebarKey; label: string; href: string }> = [
  { key: "attendanceManagement", label: "Quản lý chấm công", href: "/attendance-management" },
  { key: "timeRequestManagement", label: "Quản lý yêu cầu thời gian", href: "/time-request-management" },
];

const SIDEBAR_EXPANDED_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 88;

function SidebarBadge() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500">
      <RocketIcon className="h-4 w-4 text-white" />
    </div>
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
  if (normalized.includes("leader") || normalized.includes("truong nhom") || normalized.includes("manager")) {
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
  const { canManage } = workspaceAccess;
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const managementMenuRef = useRef<HTMLDivElement | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const isCollapsed = useWorkspaceSidebarStore((state) => state.isCollapsed);
  const toggleSidebarCollapsed = useWorkspaceSidebarStore((state) => state.toggleCollapsed);
  const [isManagementMenuOpen, setIsManagementMenuOpen] = useState(false);

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

      if (isCollapsed && managementMenuRef.current && !managementMenuRef.current.contains(target)) {
        setIsManagementMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isCollapsed]);

  const visibleSidebarItems = sidebarItems.filter((item) => {
    if (item.key === "departmentPerformance") {
      return canManage;
    }
    return true;
  });
  const visibleManagementItems = managementSidebarItems.filter((item) => {
    if (item.key === "attendanceManagement") {
      return workspaceAccess.canManage;
    }
    return true;
  });

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
    const departmentNameById = workspaceAccess.departments.reduce<Record<string, string>>((acc, department) => {
      acc[department.id] = department.name || "Không rõ phòng ban";
      return acc;
    }, {});

    return workspaceAccess.memberships
      .map((membership) => ({
        roleName: membership.roleId ? roleNameById[membership.roleId] ?? "Chưa gán vai trò" : "Chưa gán vai trò",
        departmentName: membership.departmentId
          ? departmentNameById[membership.departmentId] ?? "Không rõ phòng ban"
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
    if (isCollapsed) {
      setIsManagementMenuOpen(false);
      return;
    }

    if (active === "attendanceManagement" || active === "timeRequestManagement") {
      setIsManagementMenuOpen(true);
    }
  }, [active, isCollapsed]);

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
    <>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col overflow-visible bg-[#081633] text-slate-100 transition-[width,padding] duration-200 lg:flex"
        style={{
          width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
          paddingLeft: isCollapsed ? 12 : 20,
          paddingRight: isCollapsed ? 12 : 20,
        }}
      >
        <div className="flex h-full flex-col overflow-x-visible overflow-y-auto pb-5 pt-6">
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
              setIsManagementMenuOpen(false);
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

          <nav className="space-y-2">
            {visibleSidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  title={item.label}
                  className={`group relative flex w-full items-center rounded-xl text-left font-medium tracking-[-0.01em] transition ${
                    isCollapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3 text-lg"
                  } ${
                    item.key === active
                      ? "bg-[#1e62d8] text-white"
                      : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!isCollapsed ? item.label : null}
                  {isCollapsed ? (
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-[#0d234f] px-3 py-1.5 text-sm font-semibold text-white opacity-0 shadow-2xl transition duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                      {item.label}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {visibleManagementItems.length > 0 ? (
              isCollapsed ? (
                <div ref={managementMenuRef} className="relative">
                  <button
                    type="button"
                    title="Quản lý"
                    onClick={() => {
                      setIsManagementMenuOpen((prev) => !prev);
                      setIsUserMenuOpen(false);
                    }}
                    className={`group relative flex w-full items-center justify-center rounded-xl px-0 py-3 text-left font-medium tracking-[-0.01em] transition ${
                      active === "attendanceManagement" || active === "timeRequestManagement"
                        ? "bg-[#0b1e43] text-white"
                        : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                    }`}
                  >
                    <ClockIcon className="h-[18px] w-[18px] shrink-0" />
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-[#0d234f] px-3 py-1.5 text-sm font-semibold text-white opacity-0 shadow-2xl transition duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                      Quản lý
                    </span>
                  </button>

                  {isManagementMenuOpen ? (
                    <div className="absolute left-full top-0 z-50 ml-3 w-[240px] rounded-xl border border-slate-700 bg-[#0d234f] p-2 shadow-2xl">
                      <div className="mb-2 rounded-xl bg-[#12306b] px-3 py-2">
                        <p className="text-sm font-semibold text-white">Quản lý</p>
                        <p className="mt-1 text-xs text-slate-300">Các màn tác vụ quản trị nội bộ</p>
                      </div>
                      {visibleManagementItems.map((item) => (
                        <Link
                          key={item.key}
                          href={item.href}
                          onClick={() => setIsManagementMenuOpen(false)}
                          className={`mb-1 flex min-h-9 items-center rounded-lg px-3 py-2 text-sm font-semibold transition last:mb-0 ${
                            item.key === active
                              ? "bg-[#1e62d8] text-white"
                              : "text-slate-100 hover:bg-[#12306b]"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <Collapsible open={isManagementMenuOpen} onOpenChange={setIsManagementMenuOpen}>
                  <div className="space-y-2">
                    <CollapsibleTrigger
                      title="Quản lý"
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-lg font-medium tracking-[-0.01em] transition ${
                        active === "attendanceManagement" || active === "timeRequestManagement"
                          ? "bg-[#0b1e43] text-white"
                          : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <ClockIcon className="h-[18px] w-[18px] shrink-0" />
                        Quản lý
                      </span>
                      {isManagementMenuOpen ? (
                        <ChevronUpIcon className="h-4 w-4 text-slate-300" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4 text-slate-300" />
                      )}
                    </CollapsibleTrigger>

                    <CollapsibleContent className="space-y-2">
                      {visibleManagementItems.map((item) => (
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
                  </div>
                </Collapsible>
              )
            ) : null}
          </nav>

          <div className="mt-auto space-y-4">
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen((prev) => !prev);
                  setLogoutError(null);
                }}
                title={sidebarName}
                className={`flex w-full items-center rounded-xl bg-[#0d234f] p-3 text-left transition hover:bg-[#12306b] ${
                  isCollapsed ? "justify-center" : "justify-between gap-3"
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
                    {isUserMenuOpen ? (
                      <ChevronUpIcon className="h-4 w-4 text-slate-300" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-slate-300" />
                    )}
                  </>
                )}
              </button>

              {isUserMenuOpen ? (
                <div
                  className={`rounded-xl border border-slate-700 bg-[#0d234f] p-2 shadow-2xl ${
                    isCollapsed
                      ? "absolute bottom-0 left-full ml-3 w-[240px] z-50"
                      : "mt-2"
                  }`}
                >
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
    </>
  );
}
