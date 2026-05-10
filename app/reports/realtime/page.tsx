"use client";

import { endOfWeek, format, startOfWeek } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BlockState, SectionTitle } from "@/app/reports/_components/reporting-ui";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDashboardTaskProgress } from "@/lib/dashboard";
import {
  buildGoalReportProfileIds,
  formatReportDateRange,
  formatReportPointValue,
  formatReportProgressValue,
  getPerformanceReportMetricKind,
  loadReportingScopeDirectory,
  type PerformanceReportRoleMembershipRow,
  type ReportingScopeDirectory,
} from "@/lib/performance-reports";
import { buildGoalProgressMap, buildKeyResultProgressMap, computeMetricProgress } from "@/lib/okr";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";
import { supabase } from "@/lib/supabase";

type RealtimeKrRpcRow = {
  id: string;
  current: number | null;
  target: number | null;
};

type GoalOwnerRow = {
  profile_id: string | null;
  goal_id: string | null;
};

type GoalRow = {
  id: string;
  type: string | null;
  target: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
};

type KeyResultRow = {
  id: string;
  goal_id: string | null;
  contribution_type: string | null;
  start_value: number | null;
  current: number | null;
  target: number | null;
  start_date: string | null;
  end_date: string | null;
};

type TaskRow = {
  id: string;
  assignee_id: string | null;
  profile_id: string | null;
  type: string | null;
  current: number | null;
  target: number | null;
  weight: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
};

type RealtimeMemberRow = {
  profileId: string;
  profileName: string;
  departmentLabel: string;
  departmentIds: string[];
  metricKind: "goal" | "kr";
  goalProgress: number | null;
  krProgress: number | null;
  taskCount: number;
  completedTaskCount: number;
  totalTaskPoints: number;
  completedTaskPoints: number;
};

const REFRESH_INTERVAL_MS = 60_000;

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const overlapsPeriod = ({
  startDate,
  endDate,
  createdAt,
  periodStart,
  periodEnd,
}: {
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  periodStart: string;
  periodEnd: string;
}) => {
  const start = startDate ?? null;
  const end = endDate ?? null;
  const created = createdAt ? String(createdAt).slice(0, 10) : null;

  if (start && end) {
    return start <= periodEnd && end >= periodStart;
  }
  if (start) {
    return start >= periodStart && start <= periodEnd;
  }
  if (end) {
    return end >= periodStart && end <= periodEnd;
  }
  if (created) {
    return created >= periodStart && created <= periodEnd;
  }
  return true;
};

const average = (values: Array<number | null | undefined>) => {
  const normalized = values.filter((value): value is number => Number.isFinite(value));
  if (normalized.length === 0) {
    return null;
  }
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
};

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-semibold text-slate-900">{label}</span>
      {children}
    </label>
  );
}

export default function RealtimeReportsPage() {
  const router = useRouter();
  const access = useWorkspaceAccess();
  const [scopeDirectory, setScopeDirectory] = useState<ReportingScopeDirectory | null>(null);
  const [rows, setRows] = useState<RealtimeMemberRow[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentWeekRange = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return {
      start: format(weekStart, "yyyy-MM-dd"),
      end: format(weekEnd, "yyyy-MM-dd"),
      label: formatReportDateRange(format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")),
    };
  }, []);

  useEffect(() => {
    if (access.isLoading || !access.isLoaded) {
      return;
    }

    const canViewRealtime = access.hasDirectorRole || access.hasRootLeaderAccess;
    if (!canViewRealtime) {
      setScopeDirectory(null);
      setRows([]);
      setError("Bạn không có quyền truy cập màn hình quản lý hiệu suất realtime.");
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const loadData = async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const directory = await loadReportingScopeDirectory({
          currentProfileId: access.profileId,
          currentProfileName: access.profileName,
          memberships: access.memberships,
          hasDirectorRole: access.hasDirectorRole,
          canManage: access.canManage,
          managedDepartments: access.managedDepartments,
          departments: access.departments,
        });

        const targetProfileIds = [
          ...new Set(
            (directory.roleScope === "director"
              ? directory.profileOptions.map((profile) => profile.id)
              : directory.accessibleProfileIds
            ).filter(Boolean),
          ),
        ];

        if (targetProfileIds.length === 0) {
          if (!isActive) {
            return;
          }
          setScopeDirectory(directory);
          setRows([]);
          return;
        }

        const userRoleResult = await supabase
          .from("user_role_in_department")
          .select("profile_id,department_id,role_id")
          .in("profile_id", targetProfileIds);

        if (userRoleResult.error) {
          throw new Error(userRoleResult.error.message || "Không tải được vai trò nhân sự.");
        }

        const roleRows = ((userRoleResult.data ?? []) as PerformanceReportRoleMembershipRow[]).map(
          (row) => ({
            profile_id: row.profile_id ? String(row.profile_id) : null,
            department_id: row.department_id ? String(row.department_id) : null,
            role_id: row.role_id ? String(row.role_id) : null,
          }),
        );

        const goalReportProfileIds = new Set(
          buildGoalReportProfileIds({
            roles: access.roles,
            departments: access.departments,
            memberships: roleRows,
          }),
        );

        const metricKindByProfileId = targetProfileIds.reduce<Record<string, "goal" | "kr">>(
          (acc, profileId) => {
            acc[profileId] = getPerformanceReportMetricKind(profileId, goalReportProfileIds);
            return acc;
          },
          {},
        );

        const krProgressRows = await Promise.all(
          targetProfileIds.map(async (profileId) => {
            const [directResult, supportResult] = await Promise.all([
              supabase.rpc("get_profile_krs_for_period", {
                p_profile_id: profileId,
                p_period_start: currentWeekRange.start,
                p_period_end: currentWeekRange.end,
                p_contribution_type: "direct",
              }),
              supabase.rpc("get_profile_krs_for_period", {
                p_profile_id: profileId,
                p_period_start: currentWeekRange.start,
                p_period_end: currentWeekRange.end,
                p_contribution_type: "support",
              }),
            ]);

            if (directResult.error) {
              throw new Error(directResult.error.message || "Không tải được dữ liệu KR trực tiếp.");
            }
            if (supportResult.error) {
              throw new Error(supportResult.error.message || "Không tải được dữ liệu KR phối hợp.");
            }

            const allKrs = [
              ...((directResult.data ?? []) as RealtimeKrRpcRow[]),
              ...((supportResult.data ?? []) as RealtimeKrRpcRow[]),
            ];
            const progress = average(
              allKrs.map((kr) => computeMetricProgress(kr.current, 0, kr.target)),
            );

            return {
              profileId,
              krProgress: progress,
            };
          }),
        );

        const krProgressByProfileId = krProgressRows.reduce<Record<string, number | null>>(
          (acc, row) => {
            acc[row.profileId] = row.krProgress;
            return acc;
          },
          {},
        );

        const goalProfileIds = targetProfileIds.filter(
          (profileId) => metricKindByProfileId[profileId] === "goal",
        );

        let goalProgressByProfileId: Record<string, number | null> = {};

        if (goalProfileIds.length > 0) {
          const goalOwnerResult = await supabase
            .from("goal_owners")
            .select("profile_id,goal_id")
            .in("profile_id", goalProfileIds);

          if (goalOwnerResult.error) {
            throw new Error(goalOwnerResult.error.message || "Không tải được phân công Goal.");
          }

          const goalOwnerRows = ((goalOwnerResult.data ?? []) as GoalOwnerRow[]).map((row) => ({
            profile_id: row.profile_id ? String(row.profile_id) : null,
            goal_id: row.goal_id ? String(row.goal_id) : null,
          }));

          const goalIds = [
            ...new Set(
              goalOwnerRows
                .map((row) => row.goal_id)
                .filter((goalId): goalId is string => Boolean(goalId)),
            ),
          ];

          if (goalIds.length > 0) {
            const goalsResult = await supabase
              .from("goals")
              .select("id,type,target,start_date,end_date,created_at")
              .in("id", goalIds);

            if (goalsResult.error) {
              throw new Error(goalsResult.error.message || "Không tải được Goal theo tuần.");
            }

            const goals = ((goalsResult.data ?? []) as GoalRow[]).map((goal) => ({
              id: String(goal.id),
              type: goal.type ? String(goal.type) : null,
              target: toNumber(goal.target),
              start_date: goal.start_date ? String(goal.start_date) : null,
              end_date: goal.end_date ? String(goal.end_date) : null,
              created_at: goal.created_at ? String(goal.created_at) : null,
            }));

            const trackedGoals = goals.filter((goal) =>
              overlapsPeriod({
                startDate: goal.start_date,
                endDate: goal.end_date,
                createdAt: goal.created_at,
                periodStart: currentWeekRange.start,
                periodEnd: currentWeekRange.end,
              }),
            );

            const trackedGoalIds = trackedGoals.map((goal) => goal.id);

            const keyResultsResult =
              trackedGoalIds.length > 0
                ? await supabase
                    .from("key_results")
                    .select(
                      "id,goal_id,contribution_type,start_value,current,target,start_date,end_date",
                    )
                    .in("goal_id", trackedGoalIds)
                : { data: [] as KeyResultRow[], error: null };

            if (keyResultsResult.error) {
              throw new Error(keyResultsResult.error.message || "Không tải được KR theo Goal.");
            }

            const keyResults = ((keyResultsResult.data ?? []) as KeyResultRow[])
              .map((item) => ({
                id: String(item.id),
                goal_id: item.goal_id ? String(item.goal_id) : null,
                contribution_type: item.contribution_type ? String(item.contribution_type) : null,
                start_value: toNumber(item.start_value),
                current: toNumber(item.current),
                target: toNumber(item.target),
                start_date: item.start_date ? String(item.start_date) : null,
                end_date: item.end_date ? String(item.end_date) : null,
              }))
              .filter((item) =>
                overlapsPeriod({
                  startDate: item.start_date,
                  endDate: item.end_date,
                  periodStart: currentWeekRange.start,
                  periodEnd: currentWeekRange.end,
                }),
              );

            const keyResultProgressMap = buildKeyResultProgressMap(keyResults);
            const goalProgressMap = buildGoalProgressMap(
              trackedGoals,
              keyResults,
              keyResultProgressMap,
            );
            const trackedGoalIdSet = new Set(trackedGoalIds);

            const goalProgressValuesByProfileId = goalOwnerRows.reduce<Record<string, number[]>>(
              (acc, row) => {
                if (!row.profile_id || !row.goal_id || !trackedGoalIdSet.has(row.goal_id)) {
                  return acc;
                }
                if (!acc[row.profile_id]) {
                  acc[row.profile_id] = [];
                }
                acc[row.profile_id].push(goalProgressMap[row.goal_id] ?? 0);
                return acc;
              },
              {},
            );

            goalProgressByProfileId = Object.keys(goalProgressValuesByProfileId).reduce<
              Record<string, number | null>
            >((acc, profileId) => {
              acc[profileId] = average(goalProgressValuesByProfileId[profileId]) ?? null;
              return acc;
            }, {});
          }
        }

        const [taskAssigneeResult, taskProfileResult] = await Promise.all([
          supabase
            .from("tasks")
            .select(
              "id,assignee_id,profile_id,type,current,target,weight,start_date,end_date,created_at",
            )
            .in("assignee_id", targetProfileIds),
          supabase
            .from("tasks")
            .select(
              "id,assignee_id,profile_id,type,current,target,weight,start_date,end_date,created_at",
            )
            .in("profile_id", targetProfileIds),
        ]);

        if (taskAssigneeResult.error) {
          throw new Error(
            taskAssigneeResult.error.message || "Không tải được Task theo người giao.",
          );
        }
        if (taskProfileResult.error) {
          throw new Error(
            taskProfileResult.error.message || "Không tải được Task theo người phụ trách.",
          );
        }

        const profileIdSet = new Set(targetProfileIds);
        const taskMapById = new Map<string, TaskRow>();
        [...(taskAssigneeResult.data ?? []), ...(taskProfileResult.data ?? [])].forEach((task) => {
          const taskId = task.id ? String(task.id) : null;
          if (!taskId) {
            return;
          }
          taskMapById.set(taskId, {
            id: taskId,
            assignee_id: task.assignee_id ? String(task.assignee_id) : null,
            profile_id: task.profile_id ? String(task.profile_id) : null,
            type: task.type ? String(task.type) : null,
            current: toNumber(task.current),
            target: toNumber(task.target),
            weight: toNumber(task.weight),
            start_date: task.start_date ? String(task.start_date) : null,
            end_date: task.end_date ? String(task.end_date) : null,
            created_at: task.created_at ? String(task.created_at) : null,
          });
        });

        const taskSummaryByProfileId = Array.from(taskMapById.values())
          .filter((task) =>
            overlapsPeriod({
              startDate: task.start_date,
              endDate: task.end_date,
              createdAt: task.created_at,
              periodStart: currentWeekRange.start,
              periodEnd: currentWeekRange.end,
            }),
          )
          .reduce<
            Record<
              string,
              {
                taskCount: number;
                completedTaskCount: number;
                totalTaskPoints: number;
                completedTaskPoints: number;
              }
            >
          >((acc, task) => {
            const ownerId =
              task.assignee_id && profileIdSet.has(task.assignee_id)
                ? task.assignee_id
                : task.profile_id && profileIdSet.has(task.profile_id)
                  ? task.profile_id
                  : null;

            if (!ownerId) {
              return acc;
            }

            if (!acc[ownerId]) {
              acc[ownerId] = {
                taskCount: 0,
                completedTaskCount: 0,
                totalTaskPoints: 0,
                completedTaskPoints: 0,
              };
            }

            const progress = getDashboardTaskProgress({
              current: task.current,
              target: task.target,
              type: task.type,
            });
            const isCompleted = progress >= 100;
            const taskPoint = Math.max(0, task.weight ?? 0);

            acc[ownerId].taskCount += 1;
            acc[ownerId].totalTaskPoints += taskPoint;

            if (isCompleted) {
              acc[ownerId].completedTaskCount += 1;
              acc[ownerId].completedTaskPoints += taskPoint;
            }

            return acc;
          }, {});

        const mappedRows = targetProfileIds
          .map((profileId) => {
            const profileName =
              directory.profileNameById[profileId] ??
              directory.profileOptions.find((item) => item.id === profileId)?.name ??
              profileId;
            const departmentIds = directory.membershipsByProfileId[profileId] ?? [];
            const departmentNames = [
              ...new Set(
                departmentIds
                  .map((departmentId) => directory.departmentNameById[departmentId] ?? null)
                  .filter((value): value is string => Boolean(value)),
              ),
            ];
            const metricKind = metricKindByProfileId[profileId] ?? "kr";
            const taskSummary = taskSummaryByProfileId[profileId] ?? {
              taskCount: 0,
              completedTaskCount: 0,
              totalTaskPoints: 0,
              completedTaskPoints: 0,
            };

            return {
              profileId,
              profileName,
              departmentLabel: departmentNames.join(", ") || "Chưa thuộc phòng ban",
              departmentIds,
              metricKind,
              goalProgress:
                metricKind === "goal" ? (goalProgressByProfileId[profileId] ?? null) : null,
              krProgress: metricKind === "kr" ? (krProgressByProfileId[profileId] ?? null) : null,
              taskCount: taskSummary.taskCount,
              completedTaskCount: taskSummary.completedTaskCount,
              totalTaskPoints: taskSummary.totalTaskPoints,
              completedTaskPoints: taskSummary.completedTaskPoints,
            } satisfies RealtimeMemberRow;
          })
          .sort((left, right) => left.profileName.localeCompare(right.profileName, "vi"));

        if (!isActive) {
          return;
        }

        setScopeDirectory(directory);
        setRows(mappedRows);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setScopeDirectory(null);
        setRows([]);
        setError(
          loadError instanceof Error ? loadError.message : "Không tải được báo cáo realtime.",
        );
      } finally {
        if (isActive && !silent) {
          setIsLoading(false);
        }
      }
    };

    void loadData();
    const timer = window.setInterval(() => {
      void loadData(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [
    access.canManage,
    access.departments,
    access.hasDirectorRole,
    access.hasRootLeaderAccess,
    access.isLoaded,
    access.isLoading,
    access.managedDepartments,
    access.memberships,
    access.profileId,
    access.profileName,
    access.roles,
    currentWeekRange.end,
    currentWeekRange.start,
  ]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (employeeFilter !== "all" && row.profileId !== employeeFilter) {
        return false;
      }
      if (departmentFilter !== "all" && !row.departmentIds.includes(departmentFilter)) {
        return false;
      }

      if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim().toLowerCase();
        const haystack = [row.profileName, row.departmentLabel].join(" ").toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }, [departmentFilter, employeeFilter, rows, searchKeyword]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="realtimeReports" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <WorkspacePageHeader
            title="Hiệu suất công việc"
            items={[{ label: "Hiệu suất công việc" }]}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Dữ liệu realtime tuần hiện tại: <strong>{currentWeekRange.label}</strong> (tự làm
                mới mỗi {Math.floor(REFRESH_INTERVAL_MS / 1000)} giây)
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FilterField label="Nhân sự">
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Chọn nhân sự" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {(scopeDirectory?.profileOptions ?? []).map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Phòng ban">
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Chọn phòng ban" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {(scopeDirectory?.departmentOptions ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Tìm kiếm">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="Tên nhân sự hoặc phòng ban"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </FilterField>
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <SectionTitle title="Bảng realtime theo tuần hiện tại" />

              {isLoading || error || filteredRows.length === 0 ? (
                <BlockState
                  loading={isLoading}
                  error={error}
                  empty={!error && filteredRows.length === 0}
                  emptyText="Không có dữ liệu phù hợp trong tuần hiện tại."
                />
              ) : (
                <div className="overflow-x-auto px-5 pb-5">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-sm text-slate-900">
                        <th className="px-3 py-3 font-semibold">Nhân sự</th>
                        <th className="px-3 py-3 font-semibold">Phòng ban</th>
                        <th className="px-3 py-3 font-semibold">Loại theo dõi</th>
                        <th className="px-3 py-3 font-semibold">Tiến độ Goal</th>
                        <th className="px-3 py-3 font-semibold">Tiến độ KR</th>
                        <th className="px-3 py-3 font-semibold">Task hoàn thành</th>
                        <th className="px-3 py-3 font-semibold">Điểm task hoàn thành</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr
                          key={row.profileId}
                          className="cursor-pointer border-b border-slate-100 align-top transition hover:bg-slate-50/80"
                          onClick={() => router.push(`/reports/realtime/${row.profileId}`)}
                        >
                          <td className="px-3 py-4 text-sm font-semibold text-slate-900">
                            {row.profileName}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {row.departmentLabel}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {row.metricKind === "goal" ? "Goal + KR" : "KR"}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {row.metricKind === "goal"
                              ? formatReportProgressValue(row.goalProgress)
                              : "—"}
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-700">
                            {row.metricKind === "kr"
                              ? formatReportProgressValue(row.krProgress)
                              : "—"}
                          </td>
                          <td className="px-3 py-4 text-sm font-semibold text-slate-900">
                            {row.completedTaskCount} / {row.taskCount}
                          </td>
                          <td className="px-3 py-4 text-sm font-semibold text-slate-900">
                            {formatReportPointValue(row.completedTaskPoints)} /{" "}
                            {formatReportPointValue(row.totalTaskPoints)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
