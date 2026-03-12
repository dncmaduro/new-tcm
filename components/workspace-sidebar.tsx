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
} from "@radix-ui/react-icons";
import { ComponentType, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type SidebarKey =
  | "dashboard"
  | "goals"
  | "tasks"
  | "timesheet"
  | "timeRequestManagement"
  | "reports"
  | "departments"
  | "profile";

type WorkspaceSidebarProps = {
  active: SidebarKey;
};

type SidebarIcon = ComponentType<{ className?: string }>;

type ProfileRow = {
  id: string;
  name: string | null;
  email?: string | null;
};

type UserRoleRow = {
  department_id: string | null;
  role_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string | null;
};

type RoleRow = {
  id: string;
  name: string | null;
};

const sidebarItems: Array<{ key: SidebarKey; label: string; href: string; icon: SidebarIcon }> = [
  { key: "dashboard", label: "Bảng điều khiển", href: "/dashboard", icon: DashboardIcon },
  { key: "goals", label: "Mục tiêu", href: "/goals", icon: TargetIcon },
  { key: "tasks", label: "Công việc", href: "/tasks", icon: CheckboxIcon },
  { key: "timesheet", label: "Chấm công", href: "/timesheet", icon: ClockIcon },
  { key: "timeRequestManagement", label: "Quản lý yêu cầu thời gian", href: "/time-request-management", icon: ClockIcon },
  { key: "reports", label: "Báo cáo", href: "/reports", icon: BarChartIcon },
  { key: "departments", label: "Phòng ban", href: "/departments", icon: GroupIcon },
];

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
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [sidebarName, setSidebarName] = useState("Người dùng");
  const [sidebarRole, setSidebarRole] = useState("Chưa có vai trò");
  const [sidebarDepartment, setSidebarDepartment] = useState("Chưa có phòng ban");

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }

      if (!userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadSidebarProfile = async () => {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          return;
        }

        const authUser = authData.user;
        const fallbackName =
          typeof authUser.user_metadata?.name === "string" && authUser.user_metadata.name.trim()
            ? authUser.user_metadata.name.trim()
            : authUser.email
              ? String(authUser.email).split("@")[0]
              : "Người dùng";

        const { data: profileData } = await supabase
          .from("profiles")
          .select("id,name,email")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        const profile = (profileData ?? null) as ProfileRow | null;
        const profileId = profile?.id ? String(profile.id) : null;
        const profileName = profile?.name ? String(profile.name) : fallbackName;
        setSidebarName(profileName);

        if (!profileId) {
          setSidebarRole("Chưa có vai trò");
          setSidebarDepartment("Chưa có phòng ban");
          return;
        }

        const { data: userRoleData, error: userRoleError } = await supabase
          .from("user_role_in_department")
          .select("department_id,role_id")
          .eq("profile_id", profileId);

        if (!isActive) {
          return;
        }

        if (userRoleError || !userRoleData || userRoleData.length === 0) {
          setSidebarRole("Chưa có vai trò");
          setSidebarDepartment("Chưa có phòng ban");
          return;
        }

        const typedRows = (userRoleData ?? []) as UserRoleRow[];
        const departmentIds = [...new Set(typedRows.map((row) => row.department_id).filter(Boolean))] as string[];
        const roleIds = [...new Set(typedRows.map((row) => row.role_id).filter(Boolean))] as string[];

        const [departmentResult, roleResult] = await Promise.all([
          departmentIds.length
            ? supabase.from("departments").select("id,name").in("id", departmentIds)
            : Promise.resolve({ data: [], error: null }),
          roleIds.length
            ? supabase.from("roles").select("id,name").in("id", roleIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!isActive) {
          return;
        }

        const departmentNameById = ((departmentResult.data ?? []) as DepartmentRow[]).reduce<Record<string, string>>(
          (acc, row) => {
            acc[String(row.id)] = row.name ? String(row.name) : "Không rõ phòng ban";
            return acc;
          },
          {},
        );

        const roleNameById = ((roleResult.data ?? []) as RoleRow[]).reduce<Record<string, string>>((acc, row) => {
          acc[String(row.id)] = row.name ? String(row.name) : "Chưa gán vai trò";
          return acc;
        }, {});

        const assignments = typedRows
          .map((row) => {
            const roleName = row.role_id ? roleNameById[String(row.role_id)] ?? "Chưa gán vai trò" : "Chưa gán vai trò";
            const departmentName = row.department_id
              ? departmentNameById[String(row.department_id)] ?? "Không rõ phòng ban"
              : "Không thuộc phòng ban";
            return { roleName, departmentName };
          })
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
          });

        const primaryAssignment = assignments[0];
        setSidebarRole(primaryAssignment?.roleName ?? "Chưa có vai trò");
        setSidebarDepartment(primaryAssignment?.departmentName ?? "Chưa có phòng ban");
      } catch {
        // ignore sidebar profile errors to avoid blocking navigation.
      }
    };

    void loadSidebarProfile();

    return () => {
      isActive = false;
    };
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col overflow-y-auto bg-[#081633] px-5 pb-5 pt-6 text-slate-100 lg:flex">
        <div className="mb-8 flex items-center gap-3">
          <SidebarBadge />
          <div>
            <p className="text-2xl font-semibold tracking-[-0.02em]">TCM</p>
            <p className="text-sm text-slate-400">Nền tảng quản trị</p>
          </div>
        </div>
  
        <nav className="space-y-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-lg font-medium tracking-[-0.01em] transition ${
                  item.key === active
                    ? "bg-[#1e62d8] text-white"
                    : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
  
        <div className="mt-auto space-y-4">
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen((prev) => !prev);
                setLogoutError(null);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-[#0d234f] p-3 text-left transition hover:bg-[#12306b]"
            >
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
            </button>

            {isUserMenuOpen ? (
              <div className="mt-2 rounded-xl border border-slate-700 bg-[#0d234f] p-2">
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
      </aside>
    </>
  );
}
