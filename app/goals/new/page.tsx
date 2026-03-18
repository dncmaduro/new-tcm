"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { GOAL_STATUSES, GOAL_TYPES, GoalStatusValue, GoalTypeValue } from "@/lib/constants/goals";
import { supabase } from "@/lib/supabase";
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

type ParentGoalOption = {
  id: string;
  name: string;
  departmentId: string | null;
  quarter: number | null;
  year: number | null;
};

type GoalCreatePermissionDebug = {
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
  canCreateGoal: boolean;
  error: string | null;
};

type GoalFormState = {
  name: string;
  description: string;
  type: GoalTypeValue;
  departmentId: string;
  progress: number;
  status: GoalStatusValue;
  quarter: number;
  year: number;
  note: string;
  parentGoalId: string;
};

const now = new Date();
const initialQuarter = Math.floor(now.getMonth() / 3) + 1;
const NO_PARENT_GOAL_VALUE = "__no_parent_goal__";

const defaultForm: GoalFormState = {
  name: "",
  description: "",
  type: GOAL_TYPES[0].value,
  departmentId: "",
  progress: 0,
  status: GOAL_STATUSES[0].value,
  quarter: initialQuarter,
  year: now.getFullYear(),
  note: "",
  parentGoalId: "",
};

export default function NewGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<GoalFormState>(defaultForm);
  const [rootDepartments, setRootDepartments] = useState<DepartmentOption[]>([]);
  const [allDepartments, setAllDepartments] = useState<DepartmentOption[]>([]);
  const [relatedDepartmentIds, setRelatedDepartmentIds] = useState<string[]>([]);
  const [parentGoalOptions, setParentGoalOptions] = useState<ParentGoalOption[]>([]);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [permissionDebug, setPermissionDebug] = useState<GoalCreatePermissionDebug | null>(null);

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const queryDepartmentId = searchParams.get("departmentId");

  const canCreateGoal = rootDepartments.length > 0 && !permissionError;

  useEffect(() => {
    let isActive = true;

    const loadCreatePermission = async () => {
      setIsCheckingPermission(true);
      setPermissionError(null);

      const debugState: GoalCreatePermissionDebug = {
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
        canCreateGoal: false,
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
            setAllDepartments([]);
            setRelatedDepartmentIds([]);
            setParentGoalOptions([]);
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
            setAllDepartments([]);
            setRelatedDepartmentIds([]);
            setParentGoalOptions([]);
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
            setPermissionError("Không tìm thấy role Leader để xác thực quyền tạo mục tiêu.");
            setRootDepartments([]);
            setAllDepartments([]);
            setRelatedDepartmentIds([]);
            setParentGoalOptions([]);
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
            setPermissionError("Bạn chưa có quyền tạo mục tiêu ở phòng ban gốc.");
            setRootDepartments([]);
            setAllDepartments([]);
            setRelatedDepartmentIds([]);
            setParentGoalOptions([]);
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
            setAllDepartments([]);
            setRelatedDepartmentIds([]);
            setParentGoalOptions([]);
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
        debugState.canCreateGoal = roots.length > 0;
        debugState.step = "done";

        if (!isActive) {
          return;
        }

        if (roots.length === 0) {
          setPermissionError("Bạn không có quyền tạo mục tiêu ở phòng ban cấp gốc.");
          setRootDepartments([]);
          setAllDepartments([]);
          setRelatedDepartmentIds([]);
          setParentGoalOptions([]);
          setPermissionDebug({ ...debugState });
          return;
        }

        setRootDepartments(roots);
        setPermissionDebug({ ...debugState });

        const { data: allDepartmentsData, error: allDepartmentsError } = await supabase
          .from("departments")
          .select("id,name,parent_department_id")
          .order("name", { ascending: true });

        const departmentOptions = !allDepartmentsError && (allDepartmentsData?.length ?? 0) > 0
          ? allDepartmentsData.map((department) => ({
              id: String(department.id),
              name: String(department.name),
              parentDepartmentId: department.parent_department_id
                ? String(department.parent_department_id)
                : null,
            }))
          : roots.map((department) => ({ ...department, parentDepartmentId: null }));
        setAllDepartments(departmentOptions);

        const { data: existingGoals, error: existingGoalsError } = await supabase
          .from("goals")
          .select("id,name,department_id,quarter,year")
          .order("created_at", { ascending: false });

        if (existingGoalsError) {
          setParentGoalOptions([]);
        } else {
          setParentGoalOptions(
            (existingGoals ?? []).map((goal) => ({
              id: String(goal.id),
              name: String(goal.name),
              departmentId: goal.department_id ? String(goal.department_id) : null,
              quarter: typeof goal.quarter === "number" ? goal.quarter : null,
              year: typeof goal.year === "number" ? goal.year : null,
            })),
          );
        }

        const matchedFromQuery = queryDepartmentId
          ? departmentOptions.find((department) => department.id === queryDepartmentId)
          : null;
        const nextDepartmentId = matchedFromQuery?.id ?? departmentOptions[0]?.id ?? "";
        setRelatedDepartmentIds(nextDepartmentId ? [nextDepartmentId] : []);
        setForm((prev) => ({
          ...prev,
          departmentId: nextDepartmentId,
        }));
      } catch {
        debugState.error = "Lỗi không xác định khi kiểm tra quyền tạo mục tiêu";
        debugState.step = "failed.exception";

        if (isActive) {
          setPermissionError("Có lỗi khi kiểm tra quyền tạo mục tiêu.");
          setRootDepartments([]);
          setAllDepartments([]);
          setRelatedDepartmentIds([]);
          setParentGoalOptions([]);
          setPermissionDebug({ ...debugState });
        }
      } finally {
        if (isActive) {
          setIsCheckingPermission(false);
        }

        console.groupCollapsed("[goals/new] Debug quyền tạo mục tiêu");
        console.log(debugState);
        console.groupEnd();
      }
    };

    void loadCreatePermission();

    return () => {
      isActive = false;
    };
  }, [queryDepartmentId]);

  const departmentsById = useMemo(() => {
    return allDepartments.reduce<Record<string, DepartmentOption>>((acc, department) => {
      acc[department.id] = department;
      return acc;
    }, {});
  }, [allDepartments]);

  const availableParentGoals = useMemo(() => {
    const selectedDepartment = departmentsById[form.departmentId];
    const parentDepartmentId = selectedDepartment?.parentDepartmentId ?? null;

    if (!parentDepartmentId) {
      return [];
    }

    return parentGoalOptions.filter((goal) => goal.departmentId === parentDepartmentId);
  }, [departmentsById, form.departmentId, parentGoalOptions]);

  const hasParentGoal = form.parentGoalId.trim().length > 0;
  const selectedDepartment = useMemo(
    () => allDepartments.find((department) => department.id === form.departmentId) ?? null,
    [allDepartments, form.departmentId],
  );

  const isFormValid = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.departmentId.trim().length > 0 &&
      form.type.trim().length > 0 &&
      form.status.trim().length > 0 &&
      Number.isFinite(form.quarter) &&
      form.quarter >= 1 &&
      form.quarter <= 4 &&
      Number.isFinite(form.year) &&
      form.year >= 2000
    );
  }, [form]);

  const toggleRelatedDepartment = (departmentId: string) => {
    setRelatedDepartmentIds((prev) => {
      if (departmentId === form.departmentId) {
        return Array.from(new Set([form.departmentId, ...prev.filter(Boolean)]));
      }

      if (prev.includes(departmentId)) {
        return prev.filter((item) => item !== departmentId);
      }

      return Array.from(new Set([...prev, departmentId, form.departmentId].filter(Boolean)));
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateGoal) {
      setSubmitError("Bạn không có quyền tạo mục tiêu.");
      return;
    }

    if (!isFormValid) {
      setSubmitError("Vui lòng điền đầy đủ thông tin hợp lệ.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        department_id: form.departmentId,
        progress: 0,
        status: form.status,
        quarter: Math.round(form.quarter),
        year: Math.round(form.year),
        note: form.note.trim() || null,
        parent_goal_id: form.parentGoalId || null,
      };

      const { data: createdGoal, error } = await supabase
        .from("goals")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error || !createdGoal) {
        if (error?.code === "42501") {
          setSubmitError(
            "Bạn không có quyền tạo mục tiêu (RLS). Vui lòng kiểm tra lại policy INSERT bảng goals.",
          );
        } else {
          setSubmitError(error?.message || "Không thể tạo mục tiêu.");
        }
        return;
      }

      const departmentLinks = Array.from(
        new Set([form.departmentId, ...relatedDepartmentIds].filter(Boolean)),
      ).map((departmentId) => ({
        goal_id: String(createdGoal.id),
        department_id: departmentId,
      }));

      if (departmentLinks.length > 0) {
        const { error: goalDepartmentsError } = await supabase
          .from("goal_departments")
          .upsert(departmentLinks, { onConflict: "goal_id,department_id" });

        if (goalDepartmentsError) {
          setSubmitError(
            "Mục tiêu đã được tạo nhưng chưa lưu được danh sách team phối hợp. Mở chi tiết mục tiêu để kiểm tra lại.",
          );
          return;
        }
      }

      router.push("/goals");
      router.refresh();
    } catch {
      setSubmitError("Có lỗi xảy ra khi tạo mục tiêu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[280px]">
          <header className="border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/goals" className="hover:text-slate-700">
                  Mục tiêu
                </Link>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">Tạo mục tiêu mới</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/goals"
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
                  Debug quyền tạo mục tiêu (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-6">
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                  Thêm mục tiêu mới
                </h1>
              </div>

              {isCheckingPermission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang kiểm tra quyền tạo mục tiêu...
                </div>
              ) : null}

              {!isCheckingPermission && permissionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {permissionError}
                </div>
              ) : null}

              {!isCheckingPermission && canCreateGoal ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {submitError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label htmlFor="goal-name" className="text-sm font-semibold text-slate-700">
                      Tên mục tiêu *
                    </label>
                    <input
                      id="goal-name"
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ví dụ: Tăng thị phần thêm 15% tại EU"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Loại (type)
                      </label>
                      <Select
                        value={form.type}
                        onValueChange={(value: GoalTypeValue) =>
                          setForm((prev) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn loại mục tiêu" />
                        </SelectTrigger>
                        <SelectContent>
                          {GOAL_TYPES.map((goalType) => (
                            <SelectItem key={goalType.value} value={goalType.value}>
                              {goalType.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Trạng thái (status)
                      </label>
                      <Select
                        value={form.status}
                        onValueChange={(value: GoalStatusValue) =>
                          setForm((prev) => ({ ...prev, status: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn trạng thái" />
                        </SelectTrigger>
                        <SelectContent>
                          {GOAL_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Phòng ban *
                    </label>
                    <Select
                      value={form.departmentId || undefined}
                      onValueChange={(value) => {
                        setForm((prev) => ({ ...prev, departmentId: value, parentGoalId: "" }));
                        setRelatedDepartmentIds((prev) =>
                          Array.from(new Set([value, ...prev.filter((item) => item !== form.departmentId)])),
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phòng ban" />
                      </SelectTrigger>
                      <SelectContent>
                        {allDepartments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-semibold text-slate-700">
                        Team phối hợp (`goal_departments`)
                      </label>
                      <span className="text-xs text-slate-500">
                        {relatedDepartmentIds.length} phòng ban tham gia
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap gap-2">
                        {allDepartments.map((department) => {
                          const isPrimary = department.id === form.departmentId;
                          const isSelected = relatedDepartmentIds.includes(department.id) || isPrimary;
                          return (
                            <button
                              key={department.id}
                              type="button"
                              onClick={() => toggleRelatedDepartment(department.id)}
                              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                                isSelected
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              {department.name}
                              {isPrimary ? " · chính" : ""}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Goal vẫn có `department_id` là đơn vị chính. Danh sách này dùng để lưu thêm các team cùng tham gia thực thi.
                      </p>
                    </div>
                  </div>

                  {selectedDepartment ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p className="font-semibold text-slate-800">Đơn vị chính: {selectedDepartment.name}</p>
                      <p className="mt-1">
                        Mục tiêu mới sẽ được tạo theo cấu trúc `goal -&gt; key_results -&gt; tasks`.
                        Sau khi tạo goal, bạn có thể vào trang chi tiết để thêm key result và phân công task theo từng key result.
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Mục tiêu cha (parent_goal_id)
                    </label>
                    <Select
                      value={form.parentGoalId || NO_PARENT_GOAL_VALUE}
                      onValueChange={(value) => {
                        const nextParentGoalId = value === NO_PARENT_GOAL_VALUE ? "" : value;
                        setForm((prev) => {
                          if (!nextParentGoalId) {
                            return { ...prev, parentGoalId: "" };
                          }

                          const selectedParentGoal = availableParentGoals.find(
                            (goal) => goal.id === nextParentGoalId,
                          );

                          if (
                            !selectedParentGoal ||
                            selectedParentGoal.quarter === null ||
                            selectedParentGoal.year === null
                          ) {
                            return { ...prev, parentGoalId: nextParentGoalId };
                          }

                          return {
                            ...prev,
                            parentGoalId: nextParentGoalId,
                            quarter: selectedParentGoal.quarter,
                            year: selectedParentGoal.year,
                          };
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Không có mục tiêu cha" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PARENT_GOAL_VALUE}>Không có mục tiêu cha</SelectItem>
                        {availableParentGoals.map((goal) => (
                          <SelectItem key={goal.id} value={goal.id}>
                            {goal.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <label htmlFor="goal-progress" className="text-sm font-semibold text-slate-700">
                        Tiến độ (%) - mặc định
                      </label>
                      <input
                        id="goal-progress"
                        type="number"
                        value={0}
                        disabled
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Quý (1-4) *
                      </label>
                      <Select
                        disabled={hasParentGoal}
                        value={String(form.quarter)}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, quarter: Number(value) || 1 }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn quý" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Q1</SelectItem>
                          <SelectItem value="2">Q2</SelectItem>
                          <SelectItem value="3">Q3</SelectItem>
                          <SelectItem value="4">Q4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="goal-year" className="text-sm font-semibold text-slate-700">
                        Năm *
                      </label>
                      <input
                        id="goal-year"
                        type="number"
                        min={2000}
                        max={2100}
                        disabled={hasParentGoal}
                        value={form.year}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, year: Number(event.target.value) || now.getFullYear() }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                  </div>

                  {hasParentGoal ? (
                    <p className="-mt-2 text-xs text-slate-500">
                      Quý và năm đang tự động lấy theo mục tiêu cha đã chọn.
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="goal-description"
                      className="text-sm font-semibold text-slate-700"
                    >
                      Mô tả (description)
                    </label>
                    <textarea
                      id="goal-description"
                      rows={4}
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Mô tả mục tiêu"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="goal-note" className="text-sm font-semibold text-slate-700">
                      Ghi chú (note)
                    </label>
                    <textarea
                      id="goal-note"
                      rows={3}
                      value={form.note}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, note: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ghi chú nội bộ"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <Link
                      href="/goals"
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Hủy
                    </Link>
                    <button
                      type="submit"
                      disabled={isSubmitting || !isFormValid}
                      className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSubmitting ? "Đang tạo..." : "Tạo mục tiêu"}
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
