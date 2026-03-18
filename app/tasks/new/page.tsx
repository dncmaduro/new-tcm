"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";
import {
  getTaskProgressByType,
  getTaskProgressHint,
  TASK_STATUSES,
  TASK_TYPES,
  TaskStatusValue,
  TaskTypeValue,
} from "@/lib/constants/tasks";
import {
  formatKeyResultMetric,
  formatKeyResultUnit,
  getKeyResultProgressHint,
} from "@/lib/constants/key-results";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DepartmentOption = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

type GoalOption = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
};

type ProfileOption = {
  id: string;
  name: string;
  email: string | null;
};

type KeyResultOption = {
  id: string;
  goalId: string;
  name: string;
  progress: number;
  target: number;
  current: number;
  unit: string | null;
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

type TaskFormState = {
  goalId: string;
  keyResultId: string;
  profileId: string;
  type: TaskTypeValue;
  name: string;
  description: string;
  progress: number;
  status: TaskStatusValue;
  note: string;
};

const defaultForm: TaskFormState = {
  goalId: "",
  keyResultId: "",
  profileId: "",
  type: "kpi",
  name: "",
  description: "",
  progress: 0,
  status: TASK_STATUSES[0].value,
  note: "",
};

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [rootDepartments, setRootDepartments] = useState<DepartmentOption[]>([]);
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [keyResultOptions, setKeyResultOptions] = useState<KeyResultOption[]>([]);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creatorProfileId, setCreatorProfileId] = useState<string | null>(null);
  const [permissionDebug, setPermissionDebug] = useState<TaskCreatePermissionDebug | null>(null);
  const [profileSearchKeyword, setProfileSearchKeyword] = useState("");
  const [isProfileSelectOpen, setIsProfileSelectOpen] = useState(false);

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const queryGoalId = searchParams.get("goalId");
  const queryKeyResultId = searchParams.get("keyResultId");
  const queryDepartmentId = searchParams.get("departmentId");

  const canCreateTask = rootDepartments.length > 0 && !permissionError;

  useEffect(() => {
    let isActive = true;

    const loadPermissionAndFormData = async () => {
      setIsCheckingPermission(true);
      setPermissionError(null);
      setDataLoadError(null);
      setCreatorProfileId(null);

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
            setPermissionError("Không xác thực được người dùng hiện tại.");
            setRootDepartments([]);
            setGoalOptions([]);
            setKeyResultOptions([]);
            setProfileOptions([]);
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
            setPermissionError("Không tìm thấy hồ sơ người dùng.");
            setRootDepartments([]);
            setGoalOptions([]);
            setKeyResultOptions([]);
            setProfileOptions([]);
            setPermissionDebug({ ...debugState });
          }
          return;
        }

        debugState.profileId = profile.id;
        debugState.profileName = profile.name ?? null;
        if (isActive) {
          setCreatorProfileId(String(profile.id));
        }

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
            setPermissionError("Không tìm thấy role Leader để xác thực quyền tạo công việc.");
            setRootDepartments([]);
            setGoalOptions([]);
            setKeyResultOptions([]);
            setProfileOptions([]);
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
            setPermissionError("Bạn chưa có quyền tạo công việc ở phòng ban gốc.");
            setRootDepartments([]);
            setGoalOptions([]);
            setKeyResultOptions([]);
            setProfileOptions([]);
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
            setPermissionError("Không tải được danh sách phòng ban.");
            setRootDepartments([]);
            setGoalOptions([]);
            setKeyResultOptions([]);
            setProfileOptions([]);
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
            parentDepartmentId: null,
          }));

        debugState.rootDepartments = roots;
        debugState.canCreateTask = roots.length > 0;
        debugState.step = "done";

        if (!isActive) {
          return;
        }

        if (roots.length === 0) {
          setPermissionError("Bạn không có quyền tạo công việc ở phòng ban cấp gốc.");
          setRootDepartments([]);
          setGoalOptions([]);
          setKeyResultOptions([]);
          setProfileOptions([]);
          setPermissionDebug({ ...debugState });
          return;
        }

        setRootDepartments(roots);
        setPermissionDebug({ ...debugState });

        const [
          { data: goalsData, error: goalsError },
          { data: keyResultsData, error: keyResultsError },
          { data: allDepartmentsData },
          { data: profilesData, error: profilesError },
        ] =
          await Promise.all([
            supabase
              .from("goals")
              .select("id,name,department_id,created_at")
              .order("created_at", { ascending: false }),
            supabase
              .from("key_results")
              .select("id,goal_id,name,progress,target,current,unit,created_at")
              .order("created_at", { ascending: false }),
            supabase.from("departments").select("id,name"),
            supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
          ]);

        const departmentsById = (allDepartmentsData ?? []).reduce<Record<string, string>>((acc, department) => {
          acc[String(department.id)] = String(department.name);
          return acc;
        }, {});

        const mappedGoals: GoalOption[] = (goalsData ?? []).map((goal) => {
          const departmentId = goal.department_id ? String(goal.department_id) : null;
          return {
            id: String(goal.id),
            name: String(goal.name),
            departmentId,
            departmentName: departmentId ? departmentsById[departmentId] ?? null : null,
          };
        });
        setGoalOptions(mappedGoals);

        const mappedKeyResults: KeyResultOption[] = (keyResultsData ?? []).map((keyResult) => ({
          id: String(keyResult.id),
          goalId: String(keyResult.goal_id),
          name: String(keyResult.name),
          progress: typeof keyResult.progress === "number" ? Math.round(keyResult.progress) : 0,
          target: typeof keyResult.target === "number" ? keyResult.target : Number(keyResult.target ?? 0),
          current: typeof keyResult.current === "number" ? keyResult.current : Number(keyResult.current ?? 0),
          unit: keyResult.unit ? String(keyResult.unit) : null,
        }));
        setKeyResultOptions(mappedKeyResults);

        let mappedProfiles: ProfileOption[] = [];
        if (!profilesError) {
          mappedProfiles = (profilesData ?? []).map((item) => ({
            id: String(item.id),
            name: String(item.name ?? "Chưa có tên"),
            email: item.email ? String(item.email) : null,
          }));
        }
        setProfileOptions(mappedProfiles);

        const loadErrorMessages: string[] = [];
        if (goalsError) {
          loadErrorMessages.push("Không tải được danh sách mục tiêu.");
        }
        if (keyResultsError) {
          loadErrorMessages.push("Không tải được danh sách key result.");
        }
        if (profilesError) {
          loadErrorMessages.push(
            "Không tải được toàn bộ người phụ trách. Kiểm tra policy SELECT của bảng profiles.",
          );
        }
        if (loadErrorMessages.length > 0) {
          setDataLoadError(loadErrorMessages.join(" "));
        }

        const preselectedKeyResult = queryKeyResultId
          ? mappedKeyResults.find((item) => item.id === queryKeyResultId) ?? null
          : null;

        const preselectedGoal =
          (preselectedKeyResult
            ? mappedGoals.find((item) => item.id === preselectedKeyResult.goalId) ?? null
            : null) ??
          (queryGoalId ? mappedGoals.find((item) => item.id === queryGoalId) : null) ??
          (queryDepartmentId
            ? mappedGoals.find((item) => item.departmentId === queryDepartmentId)
            : null) ??
          null;

        const preselectedGoalId = preselectedGoal?.id ?? "";
        const preselectedGoalKeyResult =
          preselectedKeyResult && preselectedKeyResult.goalId === preselectedGoalId
            ? preselectedKeyResult
            : mappedKeyResults.find((item) => item.goalId === preselectedGoalId) ?? null;

        setForm((prev) => ({
          ...prev,
          goalId: preselectedGoalId,
          keyResultId: preselectedGoalKeyResult?.id ?? "",
          profileId: mappedProfiles[0]?.id ?? "",
        }));
      } catch {
        debugState.error = "Lỗi không xác định khi kiểm tra quyền tạo công việc";
        debugState.step = "failed.exception";
        if (isActive) {
          setPermissionError("Có lỗi khi kiểm tra quyền tạo công việc.");
          setRootDepartments([]);
          setGoalOptions([]);
          setKeyResultOptions([]);
          setProfileOptions([]);
          setPermissionDebug({ ...debugState });
        }
      } finally {
        if (isActive) {
          setIsCheckingPermission(false);
        }

        console.groupCollapsed("[tasks/new] Debug quyền tạo công việc");
        console.log(debugState);
        console.groupEnd();
      }
    };

    void loadPermissionAndFormData();

    return () => {
      isActive = false;
    };
  }, [queryGoalId, queryKeyResultId, queryDepartmentId]);

  const isFormValid = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.profileId.trim().length > 0 &&
      form.status.trim().length > 0,
    [form],
  );
  const filteredProfileOptions = useMemo(() => {
    const keyword = profileSearchKeyword.trim().toLowerCase();
    if (!keyword) {
      return profileOptions;
    }
    return profileOptions.filter((profile) =>
      `${profile.name} ${profile.email ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [profileOptions, profileSearchKeyword]);

  const availableKeyResults = useMemo(
    () => keyResultOptions.filter((keyResult) => keyResult.goalId === form.goalId),
    [form.goalId, keyResultOptions],
  );

  const selectedGoal = useMemo(
    () => goalOptions.find((goal) => goal.id === form.goalId) ?? null,
    [form.goalId, goalOptions],
  );

  const selectedKeyResult = useMemo(
    () => keyResultOptions.find((keyResult) => keyResult.id === form.keyResultId) ?? null,
    [form.keyResultId, keyResultOptions],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateTask) {
      setSubmitError("Bạn không có quyền tạo công việc.");
      return;
    }

    if (!isFormValid) {
      setSubmitError("Vui lòng điền đầy đủ thông tin hợp lệ.");
      return;
    }
    if (!creatorProfileId) {
      setSubmitError("Không xác định được người tạo công việc hiện tại.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        goal_id: form.goalId.trim() ? form.goalId : null,
        key_result_id: form.keyResultId.trim() ? form.keyResultId : null,
        profile_id: form.profileId,
        creator_profile_id: creatorProfileId,
        type: form.type,
        name: form.name.trim(),
        description: form.description.trim() || null,
        progress: getTaskProgressByType(form.type, form.status, form.progress),
        status: form.status,
        note: form.note.trim() || null,
      };

      const { error } = await supabase.from("tasks").insert(payload);
      if (error) {
        if (error.code === "42501") {
          setSubmitError(
            "Bạn không có quyền tạo công việc (RLS). Vui lòng kiểm tra lại policy INSERT bảng tasks.",
          );
        } else {
          setSubmitError(error.message || "Không thể tạo công việc.");
        }
        return;
      }

      router.push("/tasks");
      router.refresh();
    } catch {
      setSubmitError("Có lỗi xảy ra khi tạo công việc.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="tasks" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
          <header className="border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/tasks" className="hover:text-slate-700">
                  Công việc
                </Link>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">Tạo công việc mới</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/tasks"
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quay lại
                </Link>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            {showPermissionDebug && permissionDebug ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo công việc (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-6">
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                  Thêm công việc mới
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Điền thông tin để tạo công việc mới và phân công cho thành viên phù hợp.
                </p>
              </div>

              {isCheckingPermission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang kiểm tra quyền tạo công việc...
                </div>
              ) : null}

              {!isCheckingPermission && permissionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {permissionError}
                </div>
              ) : null}

              {!isCheckingPermission && canCreateTask ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {dataLoadError ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {dataLoadError}
                    </div>
                  ) : null}

                  {submitError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label htmlFor="task-name" className="text-sm font-semibold text-slate-700">
                      Tên công việc *
                    </label>
                    <input
                      id="task-name"
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ví dụ: Hoàn thành mục tiêu Media"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Mục tiêu</label>
                      <Select
                        value={form.goalId || "__no_goal__"}
                        onValueChange={(value) => {
                          const nextGoalId = value === "__no_goal__" ? "" : value;
                          setForm((prev) => ({
                            ...prev,
                            goalId: nextGoalId,
                            keyResultId:
                              nextGoalId && prev.keyResultId
                                ? keyResultOptions.find(
                                    (keyResult) =>
                                      keyResult.id === prev.keyResultId && keyResult.goalId === nextGoalId,
                                  )?.id ?? ""
                                : "",
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn mục tiêu" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_goal__">Không gắn mục tiêu</SelectItem>
                          {goalOptions.map((goal) => (
                            <SelectItem key={goal.id} value={goal.id}>
                              {goal.name}
                              {goal.departmentName ? ` · ${goal.departmentName}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Key result</label>
                      <Select
                        value={form.keyResultId || "__no_key_result__"}
                        onValueChange={(value) => {
                          if (value === "__no_key_result__") {
                            setForm((prev) => ({ ...prev, keyResultId: "" }));
                            return;
                          }

                          const matchedKeyResult =
                            keyResultOptions.find((keyResult) => keyResult.id === value) ?? null;
                          setForm((prev) => ({
                            ...prev,
                            goalId: matchedKeyResult?.goalId ?? prev.goalId,
                            keyResultId: value,
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn key result" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__no_key_result__">Chưa gắn key result</SelectItem>
                          {availableKeyResults.map((keyResult) => (
                            <SelectItem key={keyResult.id} value={keyResult.id}>
                              {keyResult.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedGoal ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p className="font-semibold text-slate-800">{selectedGoal.name}</p>
                      <p className="mt-1">
                        {selectedGoal.departmentName
                          ? `Đơn vị chính: ${selectedGoal.departmentName}.`
                          : "Mục tiêu này chưa có thông tin phòng ban."}
                        {" "}
                        {availableKeyResults.length > 0
                          ? `Có ${availableKeyResults.length} key result để gắn công việc.`
                          : "Mục tiêu này chưa có key result, task sẽ nằm ở cấp goal."}
                      </p>
                    </div>
                  ) : null}

                  {selectedKeyResult ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{selectedKeyResult.name}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Tiến độ {selectedKeyResult.progress}% · {formatKeyResultMetric(selectedKeyResult.current, selectedKeyResult.unit)}
                            {" / "}
                            {formatKeyResultMetric(selectedKeyResult.target, selectedKeyResult.unit)} · {formatKeyResultUnit(selectedKeyResult.unit)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {getKeyResultProgressHint(selectedKeyResult.unit)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                          Task sẽ được gắn vào key result này
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Người phụ trách *</label>
                      <Select
                        open={isProfileSelectOpen}
                        onOpenChange={(open) => {
                          setIsProfileSelectOpen(open);
                          if (!open) {
                            setProfileSearchKeyword("");
                          }
                        }}
                        value={form.profileId || undefined}
                        onValueChange={(value) => {
                          setForm((prev) => ({ ...prev, profileId: value }));
                          setProfileSearchKeyword("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn người phụ trách" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="sticky top-0 z-30 -mx-1 mb-2 border-b border-slate-100 bg-white px-2 pb-2 pt-2 shadow-[0_1px_0_0_rgba(226,232,240,1)] relative">
                            <input
                              autoFocus
                              value={profileSearchKeyword}
                              onChange={(event) => setProfileSearchKeyword(event.target.value)}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Escape") {
                                  setIsProfileSelectOpen(false);
                                }
                              }}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              placeholder="Tìm theo tên hoặc email"
                            />
                            <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-2 bg-white" />
                          </div>
                          {filteredProfileOptions.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name}
                              {profile.email ? ` · ${profile.email}` : ""}
                            </SelectItem>
                          ))}
                          {filteredProfileOptions.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-slate-500">
                              Không tìm thấy người phù hợp.
                            </div>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Loại task</label>
                      <Select
                        value={form.type}
                        onValueChange={(value: TaskTypeValue) =>
                          setForm((prev) => ({
                            ...prev,
                            type: value,
                            progress: getTaskProgressByType(value, prev.status, prev.progress),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn loại task" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Trạng thái</label>
                      <Select
                        value={form.status}
                        onValueChange={(value: TaskStatusValue) =>
                          setForm((prev) => ({
                            ...prev,
                            status: value,
                            progress: getTaskProgressByType(prev.type, value, prev.progress),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn trạng thái" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {getTaskProgressHint(form.type)}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="task-progress" className="text-sm font-semibold text-slate-700">
                        Tiến độ (%)
                      </label>
                      <input
                        id="task-progress"
                        type="number"
                        value={getTaskProgressByType(form.type, form.status, form.progress)}
                        disabled={form.type === "okr"}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            progress: Number(event.target.value) || 0,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600 outline-none disabled:cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Cách tính tiến độ</label>
                      <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                        {form.type === "okr"
                          ? `${TASK_STATUSES.find((item) => item.value === form.status)?.label ?? "Cần làm"} = ${getTaskProgressByType(form.type, form.status, form.progress)}%`
                          : "Nhập trực tiếp theo % hoàn thành"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="task-description" className="text-sm font-semibold text-slate-700">Mô tả</label>
                    <textarea
                      id="task-description"
                      rows={4}
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Mô tả công việc"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="task-note" className="text-sm font-semibold text-slate-700">Ghi chú</label>
                    <textarea
                      id="task-note"
                      rows={3}
                      value={form.note}
                      onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ghi chú nội bộ"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <Link
                      href="/tasks"
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Hủy
                    </Link>
                    <button
                      type="submit"
                      disabled={isSubmitting || !isFormValid}
                      className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSubmitting ? "Đang tạo..." : "Tạo công việc"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
