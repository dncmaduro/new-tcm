"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { ClearableNumberInput } from "@/components/ui/clearable-number-input";
import {
  getKeyResultProgressHint,
  KEY_RESULT_UNITS,
  type KeyResultUnitValue,
} from "@/lib/constants/key-results";
import { buildWorkspaceAccessDebug, useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimelineRangeVi, isDateRangeOrdered } from "@/lib/timeline";

type GoalDetailRow = {
  id: string;
  name: string;
  department_id: string | null;
  parent_goal_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

type GoalDepartmentLinkRow = {
  department_id: string | null;
  role: string | null;
  goal_weight: number | null;
  kr_weight: number | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type GoalDepartmentItem = {
  departmentId: string;
  name: string;
  role: string;
};

type KeyResultFormState = {
  name: string;
  description: string;
  unit: KeyResultUnitValue;
  target: number;
  current: number;
  weight: number;
  responsibleDepartmentId: string;
  startDate: string;
  endDate: string;
};

type KeyResultCreatePermissionDebug = {
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
  canCreateKeyResult: boolean;
  error: string | null;
};

const defaultKeyResultForm: KeyResultFormState = {
  name: "",
  description: "",
  unit: "count",
  target: 100,
  current: 0,
  weight: 1,
  responsibleDepartmentId: "",
  startDate: "",
  endDate: "",
};

const DEFAULT_KEY_RESULT_START_VALUE = 0;

const getReadableKeyResultSubmitError = (message: string | null | undefined) => {
  const normalizedMessage = String(message ?? "").toLowerCase();

  if (normalizedMessage.includes('record "new" has no field "progress"')) {
    return "DB đang còn trigger cũ của key result dùng cột progress không còn tồn tại. Cần chạy migration sửa trigger key_results.";
  }

  return message || "Không thể tạo key result.";
};

function NewGoalKeyResultPageContent() {
  const params = useParams<{ goalId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceAccess = useWorkspaceAccess();
  const goalId = params.goalId;
  const hasValidGoalId = Boolean(goalId);

  const [goal, setGoal] = useState<GoalDetailRow | null>(null);
  const [goalDepartments, setGoalDepartments] = useState<GoalDepartmentItem[]>([]);
  const [form, setForm] = useState<KeyResultFormState>(defaultKeyResultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showPermissionDebug = searchParams.get("debugPermission") === "1";
  const isCheckingPermission = workspaceAccess.isLoading;
  const canCreateKeyResult = workspaceAccess.canManage && !workspaceAccess.error;
  const permissionError =
    workspaceAccess.error ??
    (!isCheckingPermission && !workspaceAccess.canManage
      ? "Bạn không có quyền tạo key result ở mục tiêu này."
      : null);
  const permissionDebug: KeyResultCreatePermissionDebug = useMemo(
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
      canCreateKeyResult: workspaceAccess.canManage,
    }),
    [workspaceAccess],
  );

  useEffect(() => {
    if (!hasValidGoalId) {
      setIsLoading(false);
      setLoadError("Thiếu mã mục tiêu.");
      return;
    }

    let isActive = true;

    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);

      const [{ data: goalData, error: goalError }, { data: goalDepartmentData, error: goalDepartmentError }] =
        await Promise.all([
          supabase
            .from("goals")
            .select("id,name,department_id,parent_goal_id,start_date,end_date")
            .eq("id", goalId)
            .maybeSingle(),
          supabase
            .from("goal_departments")
            .select("department_id,role,goal_weight,kr_weight")
            .eq("goal_id", goalId),
        ]);

      if (!isActive) {
        return;
      }

      if (goalError || !goalData) {
        setGoal(null);
        setGoalDepartments([]);
        setLoadError(goalError?.message || "Không tải được dữ liệu mục tiêu.");
        setIsLoading(false);
        return;
      }

      const typedGoal = goalData as GoalDetailRow;
      setGoal(typedGoal);

      const relatedDepartmentIds = Array.from(
        new Set([typedGoal.department_id, ...((goalDepartmentData ?? []) as GoalDepartmentLinkRow[]).map((item) => item.department_id)].filter(Boolean)),
      ) as string[];

      const { data: departmentsData, error: departmentsError } =
        relatedDepartmentIds.length > 0
          ? await supabase.from("departments").select("id,name").in("id", relatedDepartmentIds).order("name", { ascending: true })
          : { data: [], error: null };

      if (!isActive) {
        return;
      }

      if (departmentsError) {
        setGoalDepartments([]);
        setLoadError("Không tải được danh sách phòng ban tham gia mục tiêu.");
        setIsLoading(false);
        return;
      }

      const departmentNameById = ((departmentsData ?? []) as DepartmentRow[]).reduce<Record<string, string>>(
        (acc, department) => {
          acc[String(department.id)] = String(department.name);
          return acc;
        },
        {},
      );

      const mappedGoalDepartments = ((goalDepartmentData ?? []) as GoalDepartmentLinkRow[])
        .filter((item) => item.department_id)
        .map((item) => ({
          departmentId: String(item.department_id),
          name: departmentNameById[String(item.department_id)] ?? "Phòng ban",
          role: item.role ? String(item.role) : "participant",
        }));

      const normalizedGoalDepartments =
        mappedGoalDepartments.find((item) => item.departmentId === typedGoal.department_id) || !typedGoal.department_id
          ? mappedGoalDepartments
          : [
              {
                departmentId: String(typedGoal.department_id),
                name: departmentNameById[String(typedGoal.department_id)] ?? "Phòng ban chính",
                role: "owner",
              },
              ...mappedGoalDepartments,
            ];

      setGoalDepartments(normalizedGoalDepartments);
      setForm((prev) => ({
        ...prev,
        responsibleDepartmentId:
          prev.responsibleDepartmentId || normalizedGoalDepartments[0]?.departmentId || "",
        startDate: prev.startDate || typedGoal.start_date || "",
        endDate: prev.endDate || typedGoal.end_date || "",
      }));
      setIsLoading(false);

      if (goalDepartmentError) {
        setLoadError("Không tải đầy đủ danh sách phòng ban tham gia. Bạn vẫn có thể thử tạo KR.");
      }
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [goalId, hasValidGoalId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!goal?.id) {
      setSubmitError("Không xác định được mục tiêu để tạo key result.");
      return;
    }

    if (!canCreateKeyResult) {
      setSubmitError("Bạn không có quyền tạo key result cho mục tiêu này.");
      return;
    }

    const safeTarget = Number(form.target);
    const safeCurrent = Number(form.current);
    const safeWeight = Number(form.weight);

    if (!form.name.trim()) {
      setSubmitError("Vui lòng nhập tên key result.");
      return;
    }
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      setSubmitError("Target phải lớn hơn 0.");
      return;
    }
    if (!Number.isFinite(safeCurrent) || safeCurrent < 0) {
      setSubmitError("Hiện tại không được nhỏ hơn 0.");
      return;
    }
    if (!Number.isFinite(safeWeight) || safeWeight <= 0) {
      setSubmitError("Trọng số KR phải lớn hơn 0.");
      return;
    }
    if (!form.responsibleDepartmentId) {
      setSubmitError("Vui lòng chọn phòng ban phụ trách KR.");
      return;
    }
    if (!isDateRangeOrdered(form.startDate || null, form.endDate || null)) {
      setSubmitError("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }
    if (
      goalDepartments.length > 0 &&
      !goalDepartments.some((item) => item.departmentId === form.responsibleDepartmentId)
    ) {
      setSubmitError("Phòng ban phụ trách KR phải nằm trong danh sách phòng ban tham gia mục tiêu.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        goal_id: goal.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit: form.unit,
        start_value: DEFAULT_KEY_RESULT_START_VALUE,
        target: safeTarget,
        current: safeCurrent,
        weight: Math.round(safeWeight),
        responsible_department_id: form.responsibleDepartmentId,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
      };

      const { data: createdKeyResult, error } = await supabase
        .from("key_results")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error) {
        if (error.code === "42501") {
          setSubmitError(
            "DB đang chặn INSERT vào key_results (RLS 403). Người đang tạo goal cũng phải tạo được KR, nên cần chạy migration sửa policy bảng key_results.",
          );
        } else {
          setSubmitError(getReadableKeyResultSubmitError(error.message));
        }
        return;
      }

      const createdKeyResultId = createdKeyResult?.id ? String(createdKeyResult.id) : null;
      router.push(
        createdKeyResultId
          ? `/goals/${goal.id}/key-results/${createdKeyResultId}?created=1`
          : `/goals/${goal.id}?krCreated=1`,
      );
      router.refresh();
    } catch {
      setSubmitError("Có lỗi xảy ra khi tạo key result.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f3f5fa] text-slate-900">
      <div className="flex h-full w-full">
        <WorkspaceSidebar active="goals" />

        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f3f5fa] lg:pl-[var(--workspace-sidebar-width)]">
          <header className="border-b border-slate-200 bg-[#f3f5fa] px-4 py-4 lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <Link href="/goals" className="hover:text-slate-700">
                  Mục tiêu
                </Link>
                <span className="px-2">›</span>
                {goal ? (
                  <>
                    <Link href={`/goals/${goal.id}`} className="hover:text-slate-700">
                      {goal.name}
                    </Link>
                    <span className="px-2">›</span>
                  </>
                ) : null}
                <span className="font-semibold text-slate-700">Tạo key result mới</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={goal ? `/goals/${goal.id}` : "/goals"}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quay lại
                </Link>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5fa] px-4 py-6 lg:px-7">
            {showPermissionDebug ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-100">
                <p className="mb-2 font-semibold text-sky-300">
                  Debug quyền tạo key result (debugPermission=1)
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(permissionDebug, null, 2)}
                </pre>
              </div>
            ) : null}

            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.4)] lg:p-6">
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                  Tạo key result mới
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {goal
                    ? `Mục tiêu: ${goal.name}`
                    : "Thiết lập chỉ số, mục tiêu đích, timeline và phòng ban phụ trách KR."}
                </p>
                {goal?.start_date || goal?.end_date ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Khung thời gian mục tiêu:{" "}
                    {formatTimelineRangeVi(goal.start_date, goal.end_date, {
                      fallback: "Chưa đặt khung thời gian",
                    })}
                  </p>
                ) : null}
              </div>

              {isLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang tải dữ liệu mục tiêu...
                </div>
              ) : null}

              {!isLoading && loadError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {loadError}
                </div>
              ) : null}

              {isCheckingPermission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đang kiểm tra quyền tạo key result...
                </div>
              ) : null}

              {!isCheckingPermission && permissionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {permissionError}
                </div>
              ) : null}

              {!isLoading && !isCheckingPermission && hasValidGoalId && goal && canCreateKeyResult ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <input type="hidden" name="start_value" value={DEFAULT_KEY_RESULT_START_VALUE} readOnly />

                  {submitError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Tên key result *</label>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Ví dụ: Tăng MRR thêm 20%"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Phòng ban phụ trách *</label>
                      <Select
                        value={form.responsibleDepartmentId || undefined}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, responsibleDepartmentId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn phòng ban phụ trách" />
                        </SelectTrigger>
                        <SelectContent>
                          {goalDepartments.map((department) => (
                            <SelectItem key={department.departmentId} value={department.departmentId}>
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Đơn vị</label>
                      <Select
                        value={form.unit}
                        onValueChange={(value: KeyResultUnitValue) =>
                          setForm((prev) => ({ ...prev, unit: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn đơn vị" />
                        </SelectTrigger>
                        <SelectContent>
                          {KEY_RESULT_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Target *</label>
                      <ClearableNumberInput
                        min={0}
                        step="0.01"
                        value={form.target}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, target: value }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Hiện tại</label>
                      <ClearableNumberInput
                        min={0}
                        step="0.01"
                        value={form.current}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, current: value }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Trọng số KR (%) *</label>
                      <div className="relative">
                        <ClearableNumberInput
                          min={1}
                          step="1"
                          value={form.weight}
                          onValueChange={(value) =>
                            setForm((prev) => ({ ...prev, weight: value }))
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm font-semibold text-slate-400">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Nhập theo phần trăm, ví dụ `25` nghĩa là `25%`.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Ngày bắt đầu</label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, startDate: event.target.value }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Ngày kết thúc</label>
                      <input
                        type="date"
                        min={form.startDate || undefined}
                        value={form.endDate}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, endDate: event.target.value }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {!isDateRangeOrdered(form.startDate || null, form.endDate || null) ? (
                    <p className="-mt-2 text-xs text-rose-600">
                      Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Mô tả</label>
                    <textarea
                      rows={4}
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Mô tả phạm vi và cách đo kết quả"
                    />
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
                    <p>{getKeyResultProgressHint(form.unit)}</p>
                    <p className="mt-2">
                      Khung thời gian của KR:{" "}
                      {formatTimelineRangeVi(form.startDate || null, form.endDate || null, {
                        fallback: "KR chưa có mốc thời gian",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <Link
                      href={`/goals/${goal.id}`}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Hủy
                    </Link>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSubmitting ? "Đang tạo..." : "Tạo key result"}
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

export default function NewGoalKeyResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5fa]" />}>
      <NewGoalKeyResultPageContent />
    </Suspense>
  );
}
