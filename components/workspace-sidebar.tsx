"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  ListTodo,
  Menu,
  Settings2,
  ShieldCheck,
  Timer,
  UserCircle2,
  WalletCards,
  Clock3,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppBrandMark } from "@/components/app-brand-mark";
import { fetchAttendanceExportAccess } from "@/lib/attendance-export-client-access";
import { fetchITAdminAccess } from "@/lib/it-admin-client-access";
import { supabase } from "@/lib/supabase";
import { useWorkspaceSidebarStore } from "@/lib/stores/workspace-sidebar-store";
import { useWorkspaceAccess, useWorkspaceAccessStore } from "@/lib/stores/workspace-access-store";

type SidebarKey =
  | "dashboard"
  | "notifications"
  | "goals"
  | "tasks"
  | "backlog"
  | "realtimeReports"
  | "timesheet"
  | "attendanceExport"
  | "timeRequestForms"
  | "leaveBalance"
  | "parttimeSchedule"
  | "attendanceManagement"
  | "timeRequestManagement"
  | "reports"
  | "departments"
  | "departmentPerformance"
  | "itAdmin"
  | "profile";

type WorkspaceSidebarProps = {
  active: SidebarKey;
};

type SidebarIcon = ComponentType<{ className?: string }>;
type SidebarItem = { key: SidebarKey; label: string; href: string };
type CollapsedGroupKey = "time" | "management";

const notificationsItem: { key: SidebarKey; label: string; href: string; icon: SidebarIcon } = {
  key: "notifications",
  label: "Thông báo",
  href: "/notifications",
  icon: Bell,
};

const departmentsItem: SidebarItem = { key: "departments", label: "Phòng ban", href: "/departments" };

const timeSidebarItems: SidebarItem[] = [
  { key: "timesheet", label: "Chấm công", href: "/timesheet" },
  { key: "attendanceExport", label: "Xuất chấm công", href: "/attendance-export" },
  { key: "timeRequestForms", label: "Yêu cầu thời gian", href: "/timesheet/requests" },
  { key: "leaveBalance", label: "Quỹ phép", href: "/leave-balance" },
  { key: "parttimeSchedule", label: "Lịch part-time", href: "/parttime-schedule" },
];

const managementSidebarItems: SidebarItem[] = [
  { key: "itAdmin", label: "Quản trị IT", href: "/it-admin" },
  { key: "attendanceManagement", label: "Quản lý chấm công", href: "/attendance-management" },
  {
    key: "timeRequestManagement",
    label: "Quản lý yêu cầu thời gian",
    href: "/time-request-management",
  },
];

const SIDEBAR_EXPANDED_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 88;
const PRIMARY_ITEM_ICON_CLASS = "h-[18px] w-[18px] shrink-0";
const PRIMARY_ITEM_TEXT_CLASS = "text-[17px] font-semibold tracking-[-0.01em]";

const getSidebarItemIcon = (key: SidebarKey): ComponentType<{ className?: string }> => {
  if (key === "notifications") return Bell;
  if (key === "tasks") return ListTodo;
  if (key === "backlog") return ClipboardList;
  if (key === "reports") return FileText;
  if (key === "timesheet") return CalendarDays;
  if (key === "attendanceExport") return FileText;
  if (key === "timeRequestForms") return ClipboardList;
  if (key === "leaveBalance") return WalletCards;
  if (key === "parttimeSchedule") return Clock3;
  if (key === "realtimeReports") return Activity;
  if (key === "attendanceManagement") return ShieldCheck;
  if (key === "timeRequestManagement") return Timer;
  if (key === "departments") return Building2;
  if (key === "departmentPerformance") return Gauge;
  if (key === "itAdmin") return ShieldCheck;
  if (key === "profile") return UserCircle2;
  return LayoutDashboard;
};

function SidebarBadge() {
  return (
    <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-white/10">
      <AppBrandMark size={32} alt="TCM" className="h-8 w-8" />
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
  onItemClick,
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
  onItemClick?: () => void;
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
            <GroupIcon className={PRIMARY_ITEM_ICON_CLASS} />
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
                  onClick={() => {
                    onCollapsedOpen(false);
                    onItemClick?.();
                  }}
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
          className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition ${
            isGroupActive
              ? "bg-[#0b1e43] text-white"
              : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
          }`}
        >
          <span className={`flex items-center gap-3 ${PRIMARY_ITEM_TEXT_CLASS}`}>
            <GroupIcon className={PRIMARY_ITEM_ICON_CLASS} />
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
            onClick={onItemClick}
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
  const timeMenuRef = useRef<HTMLDivElement | null>(null);
  const managementMenuRef = useRef<HTMLDivElement | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const isCollapsed = useWorkspaceSidebarStore((state) => state.isCollapsed);
  const hydrateSidebarFromStorage = useWorkspaceSidebarStore((state) => state.hydrateFromStorage);
  const toggleSidebarCollapsed = useWorkspaceSidebarStore((state) => state.toggleCollapsed);
  const [isTimeMenuOpen, setIsTimeMenuOpen] = useState(false);
  const [isManagementMenuOpen, setIsManagementMenuOpen] = useState(false);
  const [openCollapsedGroup, setOpenCollapsedGroup] = useState<CollapsedGroupKey | null>(null);
  const [canAccessAttendanceExport, setCanAccessAttendanceExport] = useState(false);
  const [canAccessITAdmin, setCanAccessITAdmin] = useState(false);

  useEffect(() => {
    hydrateSidebarFromStorage();
  }, [hydrateSidebarFromStorage]);

  useEffect(() => {
    let isActive = true;

    const loadAttendanceExportAccess = async () => {
      const access = await fetchAttendanceExportAccess();
      if (!isActive) {
        return;
      }

      setCanAccessAttendanceExport(access.allowed);
    };

    void loadAttendanceExportAccess();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadITAdminAccess = async () => {
      const access = await fetchITAdminAccess();
      if (isActive) {
        setCanAccessITAdmin(access.allowed);
      }
    };

    void loadITAdminAccess();
    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      void loadITAdminAccess();
    });

    return () => {
      isActive = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

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
    if (item.key === "itAdmin") {
      return canAccessITAdmin;
    }
    if (item.key === "attendanceManagement") {
      return workspaceAccess.canManageAttendance;
    }
    return true;
  });
  const visibleTimeItems = timeSidebarItems.filter((item) => {
    if (item.key === "attendanceExport") {
      return canAccessAttendanceExport;
    }
    return true;
  });
  const timeGroupActive = visibleTimeItems.some((item) => item.key === active);
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
  const sidebarAvatar = workspaceAccess.profileAvatar?.trim() || null;
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

  const avatarNode = sidebarAvatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sidebarAvatar}
      alt={sidebarName}
      className="h-10 w-10 rounded-xl border border-slate-700 object-cover"
    />
  ) : (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#12306b] text-sm font-semibold text-white">
      {sidebarInitial}
    </span>
  );

  useEffect(() => {
    setIsTimeMenuOpen(timeGroupActive);
    setIsManagementMenuOpen(managementGroupActive);
  }, [managementGroupActive, timeGroupActive]);

  useEffect(() => {
    setOpenCollapsedGroup(null);
  }, [isCollapsed]);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia("(min-width: 1024px)");
    const closeMobileMenuOnDesktop = () => {
      if (desktopMediaQuery.matches) {
        setIsMobileMenuOpen(false);
      }
    };

    closeMobileMenuOnDesktop();
    desktopMediaQuery.addEventListener("change", closeMobileMenuOnDesktop);
    return () => desktopMediaQuery.removeEventListener("change", closeMobileMenuOnDesktop);
  }, []);

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
      setIsMobileMenuOpen(false);
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
      <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Mở menu điều hướng"
            className="fixed left-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </DialogTrigger>
        <DialogContent className="left-0 top-0 flex h-[100dvh] w-[min(20rem,calc(100vw-2.5rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#081633] p-5 pr-4 text-slate-100 shadow-2xl">
          <DialogTitle className="sr-only">Menu điều hướng</DialogTitle>
          <div className="mb-7 flex items-center gap-3 pr-10">
            <SidebarBadge />
            <p className="text-2xl font-semibold tracking-[-0.02em]">TCM</p>
          </div>

          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
            <nav className="space-y-2">
              <SidebarGroup
                label="Thời gian"
                icon={Clock3}
                items={visibleTimeItems}
                active={active}
                isOpen={isTimeMenuOpen}
                onOpenChange={setIsTimeMenuOpen}
                onCollapsedOpen={() => undefined}
                isCollapsed={false}
                isGroupActive={timeGroupActive}
                onParentClick={() => setIsUserMenuOpen(false)}
                onItemClick={() => setIsMobileMenuOpen(false)}
              />

              {visibleManagementItems.length > 0 ? (
                <SidebarGroup
                  label="Quản lý"
                  icon={Settings2}
                  items={visibleManagementItems}
                  active={active}
                  isOpen={isManagementMenuOpen}
                  onOpenChange={setIsManagementMenuOpen}
                  onCollapsedOpen={() => undefined}
                  isCollapsed={false}
                  isGroupActive={managementGroupActive}
                  onParentClick={() => setIsUserMenuOpen(false)}
                  onItemClick={() => setIsMobileMenuOpen(false)}
                />
              ) : null}

              <Link
                href={departmentsItem.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${PRIMARY_ITEM_TEXT_CLASS} transition ${
                  departmentsItem.key === active
                    ? "bg-[#1e62d8] text-white"
                    : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                }`}
              >
                <Building2 className={PRIMARY_ITEM_ICON_CLASS} />
                {departmentsItem.label}
              </Link>
            </nav>
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
            <Link
              href={notificationsItem.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${PRIMARY_ITEM_TEXT_CLASS} transition ${
                notificationsItem.key === active
                  ? "bg-[#1e62d8] text-white"
                  : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
              }`}
            >
              <Bell className={PRIMARY_ITEM_ICON_CLASS} />
              {notificationsItem.label}
            </Link>
            <Link
              href="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl bg-[#0d234f] p-3 text-left transition hover:bg-[#12306b]"
            >
              {avatarNode}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{sidebarName}</p>
                <p className="truncate text-sm text-slate-400">{sidebarRole} · {sidebarDepartment}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex h-10 w-full items-center justify-center rounded-xl border border-rose-300/30 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
            </button>
            {logoutError ? <p className="text-xs text-rose-200">{logoutError}</p> : null}
          </div>
        </DialogContent>
      </Dialog>

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
              <SidebarGroup
                label="Thời gian"
                icon={Clock3}
                items={visibleTimeItems}
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
                  icon={Settings2}
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

              <SidebarTooltip label={departmentsItem.label} enabled={isCollapsed}>
                <Link
                  href={departmentsItem.href}
                  title={departmentsItem.label}
                  className={`flex w-full items-center rounded-xl text-left transition ${
                    isCollapsed
                      ? "justify-center px-0 py-3"
                      : `gap-3 px-4 py-3 ${PRIMARY_ITEM_TEXT_CLASS}`
                  } ${
                    departmentsItem.key === active
                      ? "bg-[#1e62d8] text-white"
                      : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                  }`}
                >
                  <Building2 className={PRIMARY_ITEM_ICON_CLASS} />
                  {!isCollapsed ? departmentsItem.label : null}
                </Link>
              </SidebarTooltip>
            </nav>
          </div>

          <div className="mt-4 space-y-4 overflow-visible">
            <SidebarTooltip label={notificationsItem.label} enabled={isCollapsed}>
              <Link
                href={notificationsItem.href}
                title={notificationsItem.label}
                className={`flex w-full items-center rounded-xl text-left transition ${
                  isCollapsed
                    ? "justify-center px-0 py-3"
                    : `gap-3 px-4 py-3 ${PRIMARY_ITEM_TEXT_CLASS}`
                } ${
                  notificationsItem.key === active
                    ? "bg-[#1e62d8] text-white"
                    : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                }`}
              >
                <Bell className={PRIMARY_ITEM_ICON_CLASS} />
                {!isCollapsed ? notificationsItem.label : null}
              </Link>
            </SidebarTooltip>

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
                  avatarNode
                ) : (
                  <>
                    {avatarNode}
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
