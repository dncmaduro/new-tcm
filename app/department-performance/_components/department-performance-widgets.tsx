"use client";

import { Fragment, useState } from "react";
import {
  formatDateShortVi,
  type DashboardActivityItem,
} from "@/lib/dashboard";
import { formatTimelineRangeVi, getTimelineMissingReason } from "@/lib/timeline";
import {
  type DepartmentGoalExecutionItem,
  type DepartmentMemberPerformanceItem,
  type DepartmentRiskItem,
  type DepartmentUpcomingTaskItem,
} from "@/app/department-performance/use-department-performance";

const healthLabelMap: Record<DepartmentGoalExecutionItem["health"], string> = {
  on_track: "Đúng tiến độ",
  at_risk: "Có rủi ro",
  off_track: "Chậm tiến độ",
  completed: "Hoàn thành",
};

const goalStatusLabelMap: Record<string, string> = {
  draft: "Nháp",
  active: "Đang hoạt động",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

function ProgressBar({ value, colorClass }: { value: number; colorClass?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${colorClass ?? "bg-blue-600"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function BlockState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText: string;
}) {
  if (loading) {
    return <div className="px-5 py-10 text-sm text-slate-500">Đang tải dữ liệu...</div>;
  }
  if (error) {
    return <div className="px-5 py-10 text-sm text-rose-600">{error}</div>;
  }
  if (empty) {
    return <div className="px-5 py-10 text-sm text-slate-500">{emptyText}</div>;
  }
  return null;
}

export function DepartmentSummaryCards({
  summary,
  loading,
}: {
  summary: {
    totalActiveGoals: number;
    krAverageProgress: number;
    taskCompletionRate: number;
    overdueTasks: number;
    membersWithAssignedWork: number;
    membersAtRisk: number;
  };
  loading: boolean;
}) {
  const cards = [
    { title: "Mục tiêu đang chạy", value: summary.totalActiveGoals, tone: "bg-blue-50 text-blue-700" },
    { title: "KR trung bình", value: `${summary.krAverageProgress}%`, tone: "bg-emerald-50 text-emerald-700" },
    { title: "Công việc hoàn thành", value: `${summary.taskCompletionRate}%`, tone: "bg-violet-50 text-violet-700" },
    { title: "Công việc quá hạn", value: summary.overdueTasks, tone: "bg-rose-50 text-rose-700" },
    { title: "Thành viên có việc", value: summary.membersWithAssignedWork, tone: "bg-slate-100 text-slate-700" },
    { title: "Thành viên rủi ro", value: summary.membersAtRisk, tone: "bg-amber-50 text-amber-700" },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4">
          <span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-semibold uppercase ${card.tone}`}>
            {card.title}
          </span>
          <p className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
            {loading ? "--" : card.value}
          </p>
        </article>
      ))}
    </section>
  );
}

export function DepartmentProgressOverview({
  summary,
  goals,
  loading,
  error,
}: {
  summary: {
    departmentName: string;
    departmentProgress: number;
    executionHealth: "on_track" | "at_risk" | "off_track";
    krAverageProgress: number;
    taskCompletionRate: number;
  };
  goals: DepartmentGoalExecutionItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Tiến độ phòng ban</h2>
        <p className="mt-1 text-sm text-slate-500">
          Theo dõi mục tiêu, KR và sức khỏe thực thi của {summary.departmentName}.
        </p>
      </div>
      {loading || error || goals.length === 0 ? (
        <BlockState
          loading={loading}
          error={error}
          empty={goals.length === 0}
          emptyText="Phòng ban này chưa có dữ liệu mục tiêu để tổng hợp."
        />
      ) : (
        <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Tiến độ phòng ban</p>
                <p className="mt-2 text-5xl font-semibold tracking-[-0.04em] text-slate-950">
                  {summary.departmentProgress}%
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  summary.executionHealth === "on_track"
                    ? "bg-emerald-50 text-emerald-700"
                    : summary.executionHealth === "at_risk"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-700"
                }`}
              >
                {healthLabelMap[summary.executionHealth]}
              </span>
            </div>
            <div className="mt-4">
              <ProgressBar value={summary.departmentProgress} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Tiến độ KR trung bình</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.krAverageProgress}%</p>
              </div>
              <div className="rounded-xl bg-white p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Công việc hoàn thành</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.taskCompletionRate}%</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {goals.slice(0, 4).map((goal) => (
              <div key={goal.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{goal.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {goal.ownerName} · {goalStatusLabelMap[goal.status] ?? goal.status} · Vai trò {goal.participationRole}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{goal.progress}%</span>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    value={goal.progress}
                    colorClass={
                      goal.health === "completed"
                        ? "bg-emerald-500"
                        : goal.health === "on_track"
                          ? "bg-blue-600"
                          : goal.health === "at_risk"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function DepartmentGoalExecutionTable({
  goals,
  loading,
  error,
}: {
  goals: DepartmentGoalExecutionItem[];
  loading: boolean;
  error: string | null;
}) {
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Thực thi theo mục tiêu / KR</h2>
      </div>
      {loading || error || goals.length === 0 ? (
        <BlockState
          loading={loading}
          error={error}
          empty={goals.length === 0}
          emptyText="Chưa có mục tiêu phù hợp với bộ lọc hiện tại."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                <th className="px-5 py-3 font-semibold">Mục tiêu</th>
                <th className="px-4 py-3 font-semibold">Chủ sở hữu</th>
                <th className="px-4 py-3 font-semibold">Vai trò</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                <th className="px-4 py-3 font-semibold">Hiệu suất PB</th>
                <th className="px-4 py-3 font-semibold">Ảnh hưởng goal</th>
                <th className="px-4 py-3 font-semibold">Ảnh hưởng KR</th>
                <th className="px-4 py-3 font-semibold">KR</th>
                <th className="px-4 py-3 font-semibold">Công việc</th>
                <th className="px-4 py-3 font-semibold">Quá hạn</th>
                <th className="px-4 py-3 font-semibold">Hạn hoàn thành</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => {
                const expanded = expandedGoalId === goal.id;
                return (
                  <Fragment key={goal.id}>
                    <tr className="border-t border-slate-100">
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setExpandedGoalId(expanded ? null : goal.id)}
                          className="text-left"
                        >
                          <p className="text-sm font-semibold text-slate-900">{goal.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {healthLabelMap[goal.health]} · {goal.progress}%
                          </p>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.ownerName}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.participationRole}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goalStatusLabelMap[goal.status] ?? goal.status}</td>
                      <td className="px-4 py-4">
                        <ProgressBar value={goal.progress} />
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.goalInfluence}%</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.krInfluence}%</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.krCount}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.taskCount}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{goal.overdueTaskCount}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{formatDateShortVi(goal.endDate)}</td>
                    </tr>
                    {expanded ? (
                      <tr className="border-t border-slate-100 bg-slate-50">
                        <td colSpan={11} className="px-5 py-4">
                          <div className="space-y-3">
                            {goal.keyResults.map((keyResult) => (
                              <div key={keyResult.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="grid gap-3 lg:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{keyResult.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {keyResult.responsibleDepartmentName} · {keyResult.assigneeDistribution}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Khung thời gian của KR:{" "}
                                      {formatTimelineRangeVi(keyResult.startDate, keyResult.endDate, {
                                        fallback: "KR chưa có mốc thời gian",
                                      })}
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      {getTimelineMissingReason(
                                        keyResult.startDate,
                                        keyResult.endDate,
                                        "KR chưa có mốc thời gian",
                                        "Mốc thời gian KR không hợp lệ",
                                      ) ?? "Đây là khung kế hoạch cha cho các task của KR."}
                                    </p>
                                    {keyResult.ownedBySelectedDepartment ? (
                                      <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                                        KR của phòng ban đang xem
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Chỉ số</p>
                                    <p className="mt-1">
                                      {keyResult.startValue} / {keyResult.current} / {keyResult.target}
                                    </p>
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Tiến độ</p>
                                    <p className="mt-1">{keyResult.progress}%</p>
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Trọng số KR</p>
                                    <p className="mt-1">{keyResult.weight}%</p>
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Task liên kết</p>
                                    <p className="mt-1">{keyResult.taskCount}</p>
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    <ProgressBar value={keyResult.progress} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function DepartmentMemberPerformance({
  members,
  loading,
  error,
}: {
  members: DepartmentMemberPerformanceItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Hiệu suất thành viên</h2>
      </div>
      {loading || error || members.length === 0 ? (
        <BlockState
          loading={loading}
          error={error}
          empty={members.length === 0}
          emptyText="Chưa có thành viên phù hợp với bộ lọc hiện tại."
        />
      ) : (
        <div className="grid gap-4 px-5 py-5 xl:grid-cols-2">
          {members.map((member) => (
            <div key={member.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{member.roleName}</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">{member.assignedTasks} công việc</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Tỷ lệ hoàn thành</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{member.completionRate}%</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Quá hạn</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{member.overdueTasks}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Đang làm</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{member.inProgressTasks}</p>
                </div>
              </div>
              <div className="mt-4">
                <ProgressBar value={member.averageTaskProgress} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-600">
                <p>Mục tiêu tham gia: {member.goalsInvolved}</p>
                <p>KR tham gia: {member.keyResultsInvolved}</p>
                <p>Giờ hôm nay: {member.workedHoursToday}</p>
                <p>Giờ tuần này: {member.workedHoursWeek}</p>
                <p>Công việc bị chặn: {member.blockedTasks}</p>
                <p>Khối lượng đang mở: {member.activeTasks}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DepartmentRiskPanel({
  risks,
  loading,
  error,
}: {
  risks: DepartmentRiskItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Điểm nghẽn / rủi ro</h2>
      </div>
      {loading || error || risks.length === 0 ? (
        <BlockState
          loading={loading}
          error={error}
          empty={risks.length === 0}
          emptyText="Hiện chưa phát hiện điểm nghẽn nổi bật trong phạm vi lọc."
        />
      ) : (
        <div className="space-y-3 px-5 py-5">
          {risks.map((risk, index) => (
            <div key={`${risk.title}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">{risk.title}</p>
              <p className="mt-1 text-sm text-amber-700">{risk.description}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DepartmentUpcomingDeadlines({
  items,
  loading,
  error,
}: {
  items: DepartmentUpcomingTaskItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Hạn sắp tới</h2>
      </div>
      {loading || error || items.length === 0 ? (
        <BlockState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Không có deadline nổi bật trong 7 ngày tới."
        />
      ) : (
        <div className="space-y-4 px-5 py-5">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.taskName}</p>
                <span className={`text-xs font-semibold ${item.urgencyClassName}`}>{item.urgencyLabel}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.assigneeName} · {item.keyResultName}
              </p>
              <p className="mt-1 text-xs text-slate-400">{item.goalName}</p>
              <p className="mt-2 text-sm text-slate-600">{formatDateShortVi(item.endDateAt)}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DepartmentRecentActivity({
  items,
  loading,
  error,
}: {
  items: DashboardActivityItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Hoạt động gần đây</h2>
      </div>
      {loading || error || items.length === 0 ? (
        <BlockState
          loading={loading}
          error={error}
          empty={items.length === 0}
          emptyText="Chưa có hoạt động phù hợp trong phạm vi phòng ban này."
        />
      ) : (
        <div className="space-y-4 px-5 py-5">
          {items.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {activity.actorInitial}
              </span>
              <div>
                <p className="text-sm text-slate-700">{activity.message}</p>
                <p className="text-xs text-slate-400">{activity.when}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
