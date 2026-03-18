"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTaskProgressByType, TASK_STATUSES, type TaskStatusValue } from "@/lib/constants/tasks";
import { formatKeyResultMetric, formatKeyResultUnit } from "@/lib/constants/key-results";
import { supabase } from "@/lib/supabase";

type TaskMode = "list" | "kanban";
const TASKS_PAGE_SIZE = 10;

type TaskRow = {
  id: string;
  name: string;
  goal_id: string | null;
  key_result_id: string | null;
  profile_id: string | null;
  type: string | null;
  status: string | null;
  progress: number | null;
  deadline?: string | null;
  due_date?: string | null;
  due_at?: string | null;
  created_at: string | null;
};

type GoalLiteRow = {
  id: string;
  name: string;
};

type KeyResultLiteRow = {
  id: string;
  goal_id: string;
  name: string;
  current: number | null;
  target: number | null;
  unit: string | null;
};

type ProfileLiteRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskItem = {
  id: string;
  name: string;
  goalId: string | null;
  goalName: string;
  keyResultId: string | null;
  keyResultName: string;
  keyResultMetric: string;
  type: string | null;
  profileId: string | null;
  assignee: string;
  assigneeShort: string;
  status: TaskStatusValue;
  progress: number;
  deadlineAt: string | null;
  createdAt: string | null;
};

type DepartmentOption = {
  id: string;
  name: string;
};

type TaskCreatePermissionDebug = {
  checkedAt: string;
  step: string;
  authUserId: string | null;
  profileId: string | null;
  profileName: string | null;
  leaderRoleIds: string[];
  leaderRolesRaw: Array<{ id: string; name: string | null }>;
  userRoleRows: Array<{ department_id: string | null; role_id: string | null }>;
  departments: Array<{ id: string; name: string; parent_department_id: string | null }>;
  rootDepartments: Array<{ id: string; name: string }>;
  canCreateTask: boolean;
  error: string | null;
};

const statusLabelMap = TASK_STATUSES.reduce<Record<string, string>>((acc, status) => {
  acc[status.value] = status.label;
  return acc;
}, {});

const normalizeTaskStatus = (value: string | null): TaskStatusValue => {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "done" || raw === "completed") {
    return "done";
  }
  if (raw === "doing" || raw === "inprogress" || raw === "review") {
    return "doing";
  }
  if (raw === "cancelled" || raw === "canceled") {
    return "cancelled";
  }
  return "todo";
};

const resolveDeadline = (task: TaskRow) =>
  task.deadline ?? task.due_date ?? task.due_at ?? null;

const formatDate = (value: string | null) => {
  if (!value) {
    return "Chưa đặt";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
  }).format(date);
};

const toShortName = (name: string) => {
  const parts = name
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) {
    return "--";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

function StatusBadge({ status }: { status: TaskStatusValue }) {
  if (status === "doing") {
    return (
      <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
        {statusLabelMap[status]}
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
        {statusLabelMap[status]}
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
        {statusLabelMap[status]}
      </span>
    );
  }
  return (
    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      {statusLabelMap[status]}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [canCreateTask, setCanCreateTask] = useState(false);
  const [isCheckingCreatePermission, setIsCheckingCreatePermission] = useState(true);
  const [rootDepartments, setRootDepartments] = useState<DepartmentOption[]>([]);
  const [permissionDebug, setPermissionDebug] = useState<TaskCreatePermissionDebug | null>(null);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [goalFilters, setGoalFilters] = useState<Array<{ id: string; name: string }>>([]);
  const [keyResultFilters, setKeyResultFilters] = useState<Array<{ id: string; name: string; goalId: string }>>([]);
  const [assigneeFilters, setAssigneeFilters] = useState<Array<{ id: string; name: string }>>([]);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatusValue>("all");
  const [goalFilter, setGoalFilter] = useState<"all" | string>("all");
  const [keyResultFilter, setKeyResultFilter] = useState<"all" | string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | string>("all");
  const [taskPage, setTaskPage] = useState(1);

  const mode: TaskMode =
    searchParams.get("mode") === "kanban"
      ? "kanban"
      : "list";
  const showPermissionDebug = searchParams.get("debugPermission") === "1";

  const changeMode = (nextMode: TaskMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  useEffect(() => {
    let isActive = true;

    const loadTasks = async () => {
      setIsLoadingTasks(true);
      setTaskLoadError(null);

      try {
        const [
          { data: taskRows, error: taskError },
          { data: goalRows, error: goalError },
          { data: keyResultRows, error: keyResultError },
          { data: profileRows, error: profileError },
        ] =
          await Promise.all([
            supabase
              .from("tasks")
              .select("*")
              .order("created_at", { ascending: false }),
            supabase.from("goals").select("id,name"),
            supabase.from("key_results").select("id,goal_id,name,current,target,unit"),
            supabase.from("profiles").select("id,name,email"),
          ]);

        if (!isActive) {
          return;
        }

        if (taskError) {
          setTaskLoadError(taskError.message || "Không tải được danh sách công việc.");
          setTasks([]);
          setGoalFilters([]);
          setKeyResultFilters([]);
          setAssigneeFilters([]);
          return;
        }

        const goalsById = (goalRows ?? []).reduce<Record<string, string>>((acc, item: GoalLiteRow) => {
          acc[String(item.id)] = String(item.name);
          return acc;
        }, {});

        const keyResultsById = (keyResultRows ?? []).reduce<Record<string, KeyResultLiteRow>>(
          (acc, item: KeyResultLiteRow) => {
            acc[String(item.id)] = item;
            return acc;
          },
          {},
        );

        const profilesById = (profileRows ?? []).reduce<Record<string, string>>((acc, item: ProfileLiteRow) => {
          acc[String(item.id)] = String(item.name ?? item.email ?? "Chưa có tên");
          return acc;
        }, {});

        const mappedTasks = (taskRows ?? []).map((row: TaskRow) => {
          const assignee = row.profile_id ? profilesById[String(row.profile_id)] ?? "Chưa gán" : "Chưa gán";
          const goalName = row.goal_id ? goalsById[String(row.goal_id)] ?? "Chưa có mục tiêu" : "Chưa có mục tiêu";
          const keyResult = row.key_result_id ? keyResultsById[String(row.key_result_id)] ?? null : null;
          const keyResultName = keyResult?.name ? String(keyResult.name) : "Chưa gắn key result";
          const keyResultMetric = keyResult
            ? `${formatKeyResultMetric(
                typeof keyResult.current === "number" ? keyResult.current : Number(keyResult.current ?? 0),
                keyResult.unit,
              )}/${formatKeyResultMetric(
                typeof keyResult.target === "number" ? keyResult.target : Number(keyResult.target ?? 0),
                keyResult.unit,
              )} ${formatKeyResultUnit(keyResult.unit)}`
            : "Task cấp goal";

          return {
            id: String(row.id),
            name: String(row.name),
            goalId: row.goal_id ? String(row.goal_id) : null,
            goalName,
            keyResultId: row.key_result_id ? String(row.key_result_id) : null,
            keyResultName,
            keyResultMetric,
            type: row.type ? String(row.type) : null,
            profileId: row.profile_id ? String(row.profile_id) : null,
            assignee,
            assigneeShort: toShortName(assignee),
            status: normalizeTaskStatus(row.status),
            progress: getTaskProgressByType(
              row.type ? String(row.type) : null,
              normalizeTaskStatus(row.status),
              row.progress,
            ),
            deadlineAt: resolveDeadline(row),
            createdAt: row.created_at,
          } as TaskItem;
        });

        setTasks(mappedTasks);

        const mappedGoalFilters = (goalRows ?? []).map((item: GoalLiteRow) => ({
          id: String(item.id),
          name: String(item.name),
        }));
        setGoalFilters(mappedGoalFilters);

        const mappedKeyResultFilters = (keyResultRows ?? []).map((item: KeyResultLiteRow) => ({
          id: String(item.id),
          name: String(item.name),
          goalId: String(item.goal_id),
        }));
        setKeyResultFilters(mappedKeyResultFilters);

        const mappedAssigneeFilters = (profileRows ?? []).map((item: ProfileLiteRow) => ({
          id: String(item.id),
          name: String(item.name ?? item.email ?? "Chưa có tên"),
        }));
        setAssigneeFilters(mappedAssigneeFilters);

        const nonFatalErrors: string[] = [];
        if (goalError) {
          nonFatalErrors.push("Không tải được danh sách mục tiêu.");
        }
        if (keyResultError) {
          nonFatalErrors.push("Không tải được danh sách key result.");
        }
        if (profileError) {
          nonFatalErrors.push("Không tải được danh sách người phụ trách.");
        }
        setTaskLoadError(nonFatalErrors.length ? nonFatalErrors.join(" ") : null);
      } catch {
        if (!isActive) {
          return;
        }
        setTaskLoadError("Có lỗi khi tải dữ liệu công việc.");
        setTasks([]);
        setGoalFilters([]);
        setKeyResultFilters([]);
        setAssigneeFilters([]);
      } finally {
        if (isActive) {
          setIsLoadingTasks(false);
        }
      }
    };

    void loadTasks();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadCreatePermission = async () => {
      setIsCheckingCreatePermission(true);

      const debugState: TaskCreatePermissionDebug = {
        checkedAt: new Date().toISOString(),
        step: "start",
        authUserId: null,
        profileId: null,
        profileName: null,
        leaderRoleIds: [],
        leaderRolesRaw: [],
        userRoleRows: [],
        departments: [],
        rootDepartments: [],
        canCreateTask: false,
        error: null,
      };

      try {
        debugState.step = "auth.getUser";
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          debugState.error = authError?.message ?? "Không lấy được auth user";
          debugState.step = "failed.auth";
          if (isActive) {
            setCanCreateTask(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }
        debugState.authUserId = authData.user.id;

        debugState.step = "profiles.by_user_id";
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,name")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profile?.id) {
          debugState.error = profileError?.message ?? "Không tìm thấy profile theo user_id";
          debugState.step = "failed.profile";
          if (isActive) {
            setCanCreateTask(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }
        debugState.profileId = profile.id;
        debugState.profileName = profile.name ?? null;

        debugState.step = "roles.list";
        const { data: rolesData, error: roleError } = await supabase.from("roles").select("id,name");

        debugState.leaderRolesRaw = (rolesData ?? []).map((role) => ({
          id: String(role.id),
          name: typeof role.name === "string" ? role.name : null,
        }));

        const leaderRoleIds = (rolesData ?? [])
          .filter((role) => {
            const roleName = typeof role.name === "string" ? role.name.trim().toLowerCase() : "";
            return roleName === "leader" || roleName.includes("leader");
          })
          .map((role) => role.id)
          .filter(Boolean) as string[];

        debugState.leaderRoleIds = leaderRoleIds;
        if (roleError || leaderRoleIds.length === 0) {
          debugState.error = roleError?.message ?? "Không tìm thấy role Leader";
          debugState.step = "failed.role";
          if (isActive) {
            setCanCreateTask(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.step = "user_role_in_department.by_profile";
        const { data: userRolesData, error: userRolesError } = await supabase
          .from("user_role_in_department")
          .select("department_id,role_id")
          .eq("profile_id", profile.id)
          .in("role_id", leaderRoleIds);

        debugState.userRoleRows = (userRolesData ?? []).map((item) => ({
          department_id: item.department_id ?? null,
          role_id: item.role_id ?? null,
        }));

        const departmentIds = [
          ...new Set((userRolesData ?? []).map((item) => item.department_id).filter(Boolean)),
        ];

        if (userRolesError || departmentIds.length === 0) {
          debugState.error = userRolesError?.message ?? "Không có role Leader gắn với phòng ban";
          debugState.step = "failed.user_role_in_department";
          if (isActive) {
            setCanCreateTask(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.step = "departments.by_ids";
        const { data: departmentsData, error: departmentsError } = await supabase
          .from("departments")
          .select("id,name,parent_department_id")
          .in("id", departmentIds);

        if (departmentsError || !departmentsData?.length) {
          debugState.error = departmentsError?.message ?? "Không lấy được phòng ban";
          debugState.step = "failed.departments";
          if (isActive) {
            setCanCreateTask(false);
            setRootDepartments([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.departments = departmentsData.map((department) => ({
          id: String(department.id),
          name: String(department.name),
          parent_department_id: department.parent_department_id ?? null,
        }));

        const roots = departmentsData
          .filter((department) => !department.parent_department_id)
          .map((department) => ({
            id: String(department.id),
            name: String(department.name),
          }));

        debugState.rootDepartments = roots;
        debugState.canCreateTask = roots.length > 0;
        debugState.step = "done";

        if (!isActive) {
          return;
        }

        setCanCreateTask(roots.length > 0);
        setRootDepartments(roots);
        setPermissionDebug({ ...debugState });
      } catch {
        debugState.error = "Lỗi không xác định khi kiểm tra quyền tạo công việc";
        debugState.step = "failed.exception";
        if (isActive) {
          setCanCreateTask(false);
          setRootDepartments([]);
          setPermissionDebug({ ...debugState });
        }
      } finally {
        if (isActive) {
          setIsCheckingCreatePermission(false);
        }

        console.groupCollapsed("[tasks] Debug quyền tạo công việc");
        console.log(debugState);
        console.groupEnd();
      }
    };

    void loadCreatePermission();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (goalFilter !== "all" && task.goalId !== goalFilter) {
        return false;
      }
      if (keyResultFilter !== "all" && task.keyResultId !== keyResultFilter) {
        return false;
      }
      if (assigneeFilter !== "all" && task.profileId !== assigneeFilter) {
        return false;
      }

      const keyword = searchKeyword.trim().toLowerCase();
      if (!keyword) {
        return true;
      }

      const haystack = `${task.name} ${task.goalName} ${task.assignee}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [assigneeFilter, goalFilter, keyResultFilter, searchKeyword, statusFilter, tasks]);

  const totalTaskPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTasks.length / TASKS_PAGE_SIZE)),
    [filteredTasks.length],
  );
  const safeTaskPage = Math.min(taskPage, totalTaskPages);
  const paginatedTasks = useMemo(() => {
    const start = (safeTaskPage - 1) * TASKS_PAGE_SIZE;
    return filteredTasks.slice(start, start + TASKS_PAGE_SIZE);
  }, [filteredTasks, safeTaskPage]);

  useEffect(() => {
    setTaskPage(1);
  }, [searchKeyword, statusFilter, goalFilter, keyResultFilter, assigneeFilter, mode]);

  const filteredKeyResultFilters = useMemo(() => {
    if (goalFilter === "all") {
      return keyResultFilters;
    }
    return keyResultFilters.filter((keyResult) => keyResult.goalId === goalFilter);
  }, [goalFilter, keyResultFilters]);

  const todo = filteredTasks.filter((task) => task.status === "todo");
  const doing = filteredTasks.filter((task) => task.status === "doing");
  const done = filteredTasks.filter((task) => task.status === "done");
  const cancelled = filteredTasks.filter((task) => task.status === "cancelled");

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span>Công việc</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Công việc</h1>
                <p className="mt-1 text-sm text-slate-500">{filteredTasks.length} / {tasks.length} công việc</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Tìm theo tên, mục tiêu, người phụ trách..."
                  className="h-11 w-[300px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {!isCheckingCreatePermission && canCreateTask ? (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultDepartmentId = rootDepartments[0]?.id;
                      const next = defaultDepartmentId
                        ? `/tasks/new?departmentId=${defaultDepartmentId}`
                        : "/tasks/new";
                      router.push(next);
                    }}
                    className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    + Thêm công việc
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <main className="space-y-4 px-4 py-5 lg:px-7">
            {showPermissionDebug && permissionDebug ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo công việc (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as "all" | TaskStatusValue)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    {TASK_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={goalFilter}
                  onValueChange={(value) => {
                    setGoalFilter(value as "all" | string);
                    setKeyResultFilter("all");
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả mục tiêu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả mục tiêu</SelectItem>
                    {goalFilters.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        {goal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={keyResultFilter}
                  onValueChange={(value) => setKeyResultFilter(value as "all" | string)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả key result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả key result</SelectItem>
                    {filteredKeyResultFilters.map((keyResult) => (
                      <SelectItem key={keyResult.id} value={keyResult.id}>
                        {keyResult.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={assigneeFilter}
                  onValueChange={(value) => setAssigneeFilter(value as "all" | string)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tất cả người phụ trách" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả người phụ trách</SelectItem>
                    {assigneeFilters.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => {
                    setSearchKeyword("");
                    setStatusFilter("all");
                    setGoalFilter("all");
                    setKeyResultFilter("all");
                    setAssigneeFilter("all");
                  }}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Xóa lọc
                </button>
              </div>
            </section>

            <section className="flex flex-wrap items-center justify-end gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-1">
                <ModeButton active={mode === "list"} onClick={() => changeMode("list")}>
                  Danh sách
                </ModeButton>
                <ModeButton active={mode === "kanban"} onClick={() => changeMode("kanban")}>
                  Bảng
                </ModeButton>
              </div>
            </section>

            {isLoadingTasks ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải danh sách công việc...
              </div>
            ) : null}

            {!isLoadingTasks && taskLoadError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {taskLoadError}
              </div>
            ) : null}

            {!isLoadingTasks && mode === "list" ? (
              <section className="rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead>
                      <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                        <th className="px-6 py-4 font-semibold">Tên công việc</th>
                        <th className="px-4 py-4 font-semibold">Mục tiêu</th>
                        <th className="px-4 py-4 font-semibold">Key result</th>
                        <th className="px-4 py-4 font-semibold">Người phụ trách</th>
                        <th className="px-4 py-4 font-semibold">Trạng thái</th>
                        <th className="px-4 py-4 font-semibold">Tiến độ</th>
                        <th className="px-4 py-4 font-semibold">Deadline</th>
                        <th className="px-4 py-4 font-semibold">Ngày tạo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTasks.map((task) => (
                        <tr key={task.id} className="border-t border-slate-100">
                          <td className="px-6 py-4">
                            <Link
                              href={`/tasks/${task.id}`}
                              className="text-base font-semibold leading-tight text-slate-800 hover:text-blue-700"
                            >
                              {task.name}
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{task.goalName}</td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-slate-700">{task.keyResultName}</p>
                              <p className="text-xs text-slate-500">{task.keyResultMetric}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">
                                {task.assigneeShort}
                              </span>
                              <span className="text-sm text-slate-700">{task.assignee}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={task.status} />
                          </td>
                          <td className="px-4 py-4">
                            <div className="w-40 space-y-1">
                              <ProgressBar value={task.progress} />
                              <p className="text-right text-xs font-semibold text-slate-500">{task.progress}%</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-500">{formatDate(task.deadlineAt)}</td>
                          <td className="px-4 py-4 text-sm text-slate-500">{formatDate(task.createdAt)}</td>
                        </tr>
                      ))}

                      {filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                            Không có công việc phù hợp bộ lọc hiện tại.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {filteredTasks.length > 0 ? (
                  <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-sm">
                    <p className="text-slate-500">
                      Trang {safeTaskPage}/{totalTaskPages} · {filteredTasks.length} công việc
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTaskPage((prev) => Math.max(1, prev - 1))}
                        disabled={safeTaskPage <= 1}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Trước
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskPage((prev) => Math.min(totalTaskPages, prev + 1))}
                        disabled={safeTaskPage >= totalTaskPages}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {!isLoadingTasks && mode === "kanban" ? (
              <section className="grid gap-4 xl:grid-cols-4">
                {[
                  { key: "todo", title: statusLabelMap.todo, items: todo },
                  { key: "doing", title: statusLabelMap.doing, items: doing },
                  { key: "done", title: statusLabelMap.done, items: done },
                  { key: "cancelled", title: statusLabelMap.cancelled, items: cancelled },
                ].map((column) => (
                  <article key={column.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-800">{column.title}</h2>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {column.items.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {column.items.map((task) => (
                        <div key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="text-base font-semibold leading-tight text-slate-800 hover:text-blue-700"
                          >
                            {task.name}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{task.goalName}</p>
                          <p className="mt-1 text-xs text-slate-500">{task.keyResultName}</p>
                          <div className="mt-3">
                            <ProgressBar value={task.progress} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>{task.progress}%</span>
                            <span>{task.assignee}</span>
                          </div>
                        </div>
                      ))}

                      {column.items.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                          Không có công việc.
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </section>
            ) : null}

          </main>
        </div>
      </div>
    </div>
  );
}
