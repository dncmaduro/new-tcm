"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { supabase } from "@/lib/supabase";
import {
  getTaskPriorityOptionLabel,
  TASK_PRIORITIES,
  type TaskPriority,
  TASK_TYPES,
  TaskTypeValue,
} from "@/lib/constants/tasks";
import {
  getAllowedKeyResultUnitsByType,
  normalizeKeyResultTypeValue,
  normalizeKeyResultUnitForType,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import { computeMetricProgress } from "@/lib/okr";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatTimelineRangeVi,
  getTimelineOutsideParentWarning,
  isDateRangeOrdered,
} from "@/lib/timeline";

type GoalOption = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  startDate: string | null;
  endDate: string | null;
};

type ProfileOption = {
  id: string;
  name: string;
  email: string | null;
};

type KeyResultOption = {
  id: string;
  goalId: string | null;
  goalName: string;
  goalType: string | null;
  name: string;
  type: string | null;
  contributionType: string | null;
  startValue: number;
  target: number;
  current: number;
  unit: string | null;
  weight: number;
  startDate: string | null;
  endDate: string | null;
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
  priority: TaskPriority;
  unit: KeyResultUnitValue;
  target: string;
  current: string;
  name: string;
  description: string;
  note: string;
  isRecurring: boolean;
  hypothesis: string;
  result: string;
  startDate: string;
  endDate: string;
};

const defaultForm: TaskFormState = {
  goalId: "",
  keyResultId: "",
  profileId: "",
  type: "kpi",
  priority: "medium",
  unit: "count",
  target: "",
  current: "0",
  name: "",
  description: "",
  note: "",
  isRecurring: false,
  hypothesis: "",
  result: "",
  startDate: "",
  endDate: "",
};

function NewTaskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();

  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [keyResultOptions, setKeyResultOptions] = useState<KeyResultOption[]>([]);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [profileSearchKeyword, setProfileSearchKeyword] = useState("");
  const [isProfileSelectOpen, setIsProfileSelectOpen] = useState(false);

  const buildTaskMetricDraft = (
    taskType: TaskTypeValue,
    keyResult?: Pick<KeyResultOption, "type" | "unit" | "target"> | null,
  ) => {
    const normalizedType = keyResult ? normalizeKeyResultTypeValue(keyResult.type) : taskType;
    const effectiveType = taskType || normalizedType;
    const unit = normalizeKeyResultUnitForType(effectiveType, keyResult?.unit ?? null);

    return {
      type: effectiveType,
      unit,
      target:
        effectiveType === "okr"
          ? "100"
          : keyResult && Number.isFinite(keyResult.target) && Number(keyResult.target) > 0
            ? String(Number(keyResult.target))
            : "",
      current: "0",
    };
  };

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const queryGoalId = searchParams.get("goalId");
  const queryKeyResultId = searchParams.get("keyResultId");
  const queryDepartmentId = searchParams.get("departmentId");
  const isCheckingPermission = workspaceAccess.isLoading;
  const creatorProfileId = workspaceAccess.profileId;
  const canCreateTask = workspaceAccess.canManage && !workspaceAccess.error;
  const permissionError =
    workspaceAccess.error ??
    (!isCheckingPermission && !workspaceAccess.canManage
      ? "Bạn chưa có quyền tạo công việc ở phòng ban gốc."
      : null);
  const permissionDebug: TaskCreatePermissionDebug = useMemo(
    () => ({
      ...buildWorkspaceAccessDebug({
        authUserId: workspaceAccess.authUserId,
        profileId: workspaceAccess.profileId,
        profileName: workspaceAccess.profileName,
        leaderRoleIds: workspaceAccess.leaderRoleIds,
        roles: workspaceAccess.roles,
        memberships: workspaceAccess.memberships,
        departments: workspaceAccess.departments,
        managedDepartments: workspaceAccess.managedDepartments,
        canManage: workspaceAccess.canManage,
        error: workspaceAccess.error,
        lastLoadedAt: workspaceAccess.lastLoadedAt,
      }),
      canCreateTask: workspaceAccess.canManage,
    }),
    [workspaceAccess],
  );

  useEffect(() => {
    if (isCheckingPermission) {
      return;
    }

    if (!canCreateTask) {
      setGoalOptions([]);
      setKeyResultOptions([]);
      setProfileOptions([]);
      setDataLoadError(null);
      return;
    }

    let isActive = true;

    const loadFormData = async () => {
      try {
        setDataLoadError(null);

        const [
          { data: goalsData, error: goalsError },
          { data: keyResultsData, error: keyResultsError },
          { data: allDepartmentsData },
          { data: profilesData, error: profilesError },
        ] = await Promise.all([
          supabase
            .from("goals")
            .select("id,name,department_id,start_date,end_date,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("key_results")
            .select(
              `
                id,
                goal_id,
                name,
                type,
                contribution_type,
                start_value,
                target,
                current,
                unit,
                weight,
                start_date,
                end_date,
                created_at,
                goal:goals!key_results_goal_id_fkey(
                  id,
                  name,
                  type,
                  department_id,
                  start_date,
                  end_date
                )
              `,
            )
            .order("created_at", { ascending: false }),
          supabase.from("departments").select("id,name"),
          supabase.from("profiles").select("id,name,email").order("name", { ascending: true }),
        ]);

        if (!isActive) {
          return;
        }

        const departmentsById = (allDepartmentsData ?? []).reduce<Record<string, string>>(
          (acc, department) => {
            acc[String(department.id)] = String(department.name);
            return acc;
          },
          {},
        );

        const mappedGoals: GoalOption[] = (goalsData ?? []).map((goal) => {
          const departmentId = goal.department_id ? String(goal.department_id) : null;
          return {
            id: String(goal.id),
            name: String(goal.name),
            departmentId,
            departmentName: departmentId ? (departmentsById[departmentId] ?? null) : null,
            startDate: goal.start_date ? String(goal.start_date) : null,
            endDate: goal.end_date ? String(goal.end_date) : null,
          };
        });
        const baseKeyResults = ((keyResultsData ?? []) as Array<Record<string, unknown>>).map(
          (keyResult) => {
            const goalRow = Array.isArray(keyResult.goal)
              ? (keyResult.goal[0] ?? null)
              : (keyResult.goal ?? null);
            return {
              id: String(keyResult.id),
              goalId: keyResult.goal_id ? String(keyResult.goal_id) : null,
              goalName: goalRow?.name ? String(goalRow.name) : "Chưa có mục tiêu",
              goalType: goalRow?.type ? String(goalRow.type) : null,
              name: String(keyResult.name),
              type: keyResult.type ? String(keyResult.type) : null,
              contributionType: keyResult.contribution_type
                ? String(keyResult.contribution_type)
                : null,
              startValue:
                typeof keyResult.start_value === "number"
                  ? keyResult.start_value
                  : Number(keyResult.start_value ?? 0),
              target:
                typeof keyResult.target === "number"
                  ? keyResult.target
                  : Number(keyResult.target ?? 0),
              current:
                typeof keyResult.current === "number"
                  ? keyResult.current
                  : Number(keyResult.current ?? 0),
              unit: keyResult.unit ? String(keyResult.unit) : null,
              weight:
                typeof keyResult.weight === "number"
                  ? keyResult.weight
                  : Number(keyResult.weight ?? 1),
              startDate: keyResult.start_date ? String(keyResult.start_date) : null,
              endDate: keyResult.end_date ? String(keyResult.end_date) : null,
            };
          },
        );

        setKeyResultOptions(baseKeyResults);

        setGoalOptions(mappedGoals);

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
          ? (baseKeyResults.find((item) => item.id === queryKeyResultId) ?? null)
          : null;

        const goalFromKeyResult = preselectedKeyResult
          ? (mappedGoals.find((item) => item.id === preselectedKeyResult.goalId) ?? null)
          : null;
        const goalFromQuery = queryGoalId
          ? (mappedGoals.find((item) => item.id === queryGoalId) ?? null)
          : null;
        const goalFromDepartment = queryDepartmentId
          ? (mappedGoals.find((item) => item.departmentId === queryDepartmentId) ?? null)
          : null;
        const preselectedGoal = goalFromKeyResult ?? goalFromQuery ?? goalFromDepartment;

        const preselectedGoalId = preselectedGoal?.id ?? "";
        const preselectedGoalKeyResult =
          preselectedKeyResult && preselectedKeyResult.goalId === preselectedGoalId
            ? preselectedKeyResult
            : (baseKeyResults.find((item) => item.goalId === preselectedGoalId) ?? null);

        setForm((prev) => ({
          ...prev,
          goalId: preselectedGoalId,
          keyResultId: preselectedGoalKeyResult?.id ?? "",
          profileId: mappedProfiles[0]?.id ?? "",
          startDate: preselectedGoalKeyResult?.startDate ?? "",
          endDate: preselectedGoalKeyResult?.endDate ?? "",
          isRecurring: false,
          hypothesis: "",
          result: "",
          ...buildTaskMetricDraft(
            preselectedGoalKeyResult
              ? normalizeKeyResultTypeValue(preselectedGoalKeyResult.type)
              : prev.type,
            preselectedGoalKeyResult,
          ),
        }));
      } catch {
        if (isActive) {
          setGoalOptions([]);
          setKeyResultOptions([]);
          setProfileOptions([]);
          setDataLoadError("Có lỗi khi tải dữ liệu tạo công việc.");
        }
      }
    };

    void loadFormData();

    return () => {
      isActive = false;
    };
  }, [canCreateTask, isCheckingPermission, queryGoalId, queryKeyResultId, queryDepartmentId]);

  const isFormValid = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.keyResultId.trim().length > 0 &&
      form.profileId.trim().length > 0 &&
      form.unit.trim().length > 0 &&
      Number.isFinite(Number(form.target)) &&
      Number(form.target) > 0 &&
      Number.isFinite(Number(form.current)) &&
      Number(form.current) >= 0,
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
    () =>
      form.goalId
        ? keyResultOptions.filter((keyResult) => keyResult.goalId === form.goalId)
        : keyResultOptions,
    [form.goalId, keyResultOptions],
  );

  const selectedKeyResult = useMemo(
    () => keyResultOptions.find((keyResult) => keyResult.id === form.keyResultId) ?? null,
    [form.keyResultId, keyResultOptions],
  );
  const derivedProgress = (() => {
    const safeCurrent = Number(form.current);
    const safeTarget = Number(form.target);
    if (!Number.isFinite(safeCurrent) || !Number.isFinite(safeTarget) || safeTarget <= 0) {
      return 0;
    }
    return computeMetricProgress(safeCurrent, 0, safeTarget);
  })();
  const taskTimelineInputError = useMemo(() => {
    if ((form.startDate && !form.endDate) || (!form.startDate && form.endDate)) {
      return "Vui lòng nhập đủ ngày bắt đầu và ngày kết thúc hoặc để trống cả hai.";
    }
    if (!isDateRangeOrdered(form.startDate || null, form.endDate || null)) {
      return "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.";
    }
    return null;
  }, [form.endDate, form.startDate]);
  const taskTimelineAlignmentWarning = useMemo(
    () =>
      getTimelineOutsideParentWarning(
        form.startDate || null,
        form.endDate || null,
        selectedKeyResult?.startDate ?? null,
        selectedKeyResult?.endDate ?? null,
        {
          subjectLabel: "Thời gian công việc",
          parentLabel: "KR",
        },
      ),
    [form.endDate, form.startDate, selectedKeyResult?.endDate, selectedKeyResult?.startDate],
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
    if (taskTimelineInputError) {
      setSubmitError(taskTimelineInputError);
      return;
    }

    const safeTarget = Number(form.target);
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setSubmitError("Chỉ tiêu cần đạt phải lớn hơn 0.");
      return;
    }
    const safeCurrent = Number(form.current);
    if (!Number.isFinite(safeCurrent) || safeCurrent < 0) {
      setSubmitError("Giá trị hiện tại phải lớn hơn hoặc bằng 0.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        key_result_id: form.keyResultId.trim(),
        assignee_id: form.profileId,
        profile_id: form.profileId,
        creator_profile_id: creatorProfileId,
        type: form.type,
        priority: form.priority,
        unit: form.unit,
        target: safeTarget,
        current: safeCurrent,
        name: form.name.trim(),
        description: form.description.trim() || null,
        note: form.note.trim() || null,
        is_recurring: form.isRecurring,
        hypothesis: form.hypothesis.trim() || null,
        result: form.result.trim() || null,
        weight: 1,
        start_date: form.startDate.trim() || null,
        end_date: form.endDate.trim() || null,
      };

      let { error } = await supabase.from("tasks").insert(payload);
      if (
        error &&
        typeof error.message === "string" &&
        (error.message.includes("column") || error.message.includes("schema")) &&
        error.message.includes("current")
      ) {
        const retry = await supabase.from("tasks").insert({
          ...payload,
          current: undefined,
        });
        error = retry.error;
      }
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

      router.push(
        queryGoalId && queryKeyResultId
          ? `/goals/${queryGoalId}/key-results/${queryKeyResultId}?taskCreated=1`
          : "/tasks",
      );
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

        <div className="flex h-screen w-full flex-1 flex-col overflow-hidden lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Tạo công việc mới"
            items={[{ label: "Quản lý công việc", href: "/tasks" }, { label: "Tạo công việc mới" }]}
          />

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
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Ví dụ: Hoàn thành mục tiêu Media"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Mục tiêu</label>
                      <Select
                        value={form.goalId || undefined}
                        onValueChange={(value) => {
                          const nextGoalId = value;
                          const nextGoalKeyResults = keyResultOptions.filter(
                            (keyResult) => keyResult.goalId === nextGoalId,
                          );
                          const resolvedKeyResult =
                            nextGoalId && form.keyResultId
                              ? (keyResultOptions.find(
                                  (keyResult) =>
                                    keyResult.id === form.keyResultId &&
                                    keyResult.goalId === nextGoalId,
                                ) ??
                                nextGoalKeyResults[0] ??
                                null)
                              : (nextGoalKeyResults[0] ?? null);
                          setForm((prev) => ({
                            ...prev,
                            goalId: nextGoalId,
                            keyResultId: resolvedKeyResult?.id ?? "",
                            startDate: resolvedKeyResult?.startDate ?? "",
                            endDate: resolvedKeyResult?.endDate ?? "",
                            ...buildTaskMetricDraft(
                              resolvedKeyResult
                                ? normalizeKeyResultTypeValue(resolvedKeyResult.type)
                                : prev.type,
                              resolvedKeyResult,
                            ),
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn mục tiêu" />
                        </SelectTrigger>
                        <SelectContent>
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
                        value={form.keyResultId || undefined}
                        onValueChange={(value) => {
                          const matchedKeyResult =
                            keyResultOptions.find((keyResult) => keyResult.id === value) ?? null;
                          setForm((prev) => ({
                            ...prev,
                            goalId: matchedKeyResult?.goalId ?? prev.goalId,
                            keyResultId: value,
                            startDate: matchedKeyResult?.startDate ?? "",
                            endDate: matchedKeyResult?.endDate ?? "",
                            ...buildTaskMetricDraft(
                              matchedKeyResult
                                ? normalizeKeyResultTypeValue(matchedKeyResult.type)
                                : prev.type,
                              matchedKeyResult,
                            ),
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn key result" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableKeyResults.map((keyResult) => (
                            <SelectItem key={keyResult.id} value={keyResult.id}>
                              {keyResult.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedKeyResult ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Ngày bắt đầu</label>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              startDate: event.target.value,
                            }))
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">
                          Ngày kết thúc
                        </label>
                        <input
                          type="date"
                          min={form.startDate || undefined}
                          value={form.endDate}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              endDate: event.target.value,
                            }))
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <p className="md:col-span-2 text-[11px] text-slate-500">
                        Giá trị ban đầu được autofill từ Key Result đã chọn. Khi lưu, mốc thời gian
                        này thuộc riêng công việc và không làm thay đổi KR.
                      </p>
                    </div>
                  ) : null}

                  {taskTimelineInputError ? (
                    <p className="-mt-2 text-xs text-rose-600">{taskTimelineInputError}</p>
                  ) : null}

                  {selectedKeyResult && !taskTimelineInputError && taskTimelineAlignmentWarning ? (
                    <p className="-mt-2 text-xs text-amber-600">
                      {taskTimelineAlignmentWarning} Khung thời gian của KR:{" "}
                      {formatTimelineRangeVi(
                        selectedKeyResult.startDate,
                        selectedKeyResult.endDate,
                        {
                          fallback: "KR chưa có mốc thời gian",
                        },
                      )}
                    </p>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Người phụ trách *
                      </label>
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

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Loại task</label>
                      <Select
                        value={form.type}
                        onValueChange={(value: TaskTypeValue) =>
                          setForm((prev) => ({
                            ...prev,
                            type: value,
                            unit: normalizeKeyResultUnitForType(value, prev.unit),
                            target: value === "okr" ? "100" : prev.target,
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
                      <label className="text-sm font-semibold text-slate-700">Độ ưu tiên *</label>
                      <Select
                        value={form.priority}
                        onValueChange={(value: TaskPriority) =>
                          setForm((prev) => ({
                            ...prev,
                            priority: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn độ ưu tiên" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITIES.map((priority) => (
                            <SelectItem key={priority.value} value={priority.value}>
                              {getTaskPriorityOptionLabel(priority.value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Phân loại chỉ tiêu
                      </label>
                      <Select
                        value={form.unit}
                        disabled={form.type === "okr"}
                        onValueChange={(value: KeyResultUnitValue) =>
                          setForm((prev) => ({
                            ...prev,
                            unit: normalizeKeyResultUnitForType(prev.type, value),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              form.type === "okr" ? "Task OKR dùng phần trăm" : "Chọn loại chỉ tiêu"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {getAllowedKeyResultUnitsByType(form.type).map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">
                        Chỉ tiêu cần đạt *
                      </label>
                      <FormattedNumberInput
                        value={form.target}
                        disabled={form.type === "okr"}
                        onValueChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            target: value,
                          }))
                        }
                        className={`h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ${
                          form.type === "okr"
                            ? "cursor-not-allowed bg-slate-50 text-slate-400"
                            : "bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        }`}
                        placeholder={form.type === "okr" ? "Task OKR luôn là 100%" : "Ví dụ: 40"}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="task-description"
                      className="text-sm font-semibold text-slate-700"
                    >
                      Mô tả
                    </label>
                    <textarea
                      id="task-description"
                      rows={4}
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Mô tả công việc"
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

export default function NewTaskPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <NewTaskPageContent />
    </Suspense>
  );
}
