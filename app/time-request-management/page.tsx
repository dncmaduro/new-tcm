"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";

type RoleScope = "director" | "leader" | "member";

type RoleRow = {
  id: string;
  name: string | null;
};

type UserRoleRow = {
  profile_id: string | null;
  department_id: string | null;
  role_id: string | null;
};

type DepartmentRow = {
  id: string;
  parent_department_id: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email?: string | null;
};

type TimeRequestType = "leave" | "late" | "overtime";
type RequestStatus = "pending" | "approved" | "rejected";

type TimeRequestReviewerRow = {
  id: string;
  profile_id: string | null;
  is_approved: boolean | null;
  comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type TimeRequestRow = {
  id: string;
  profile_id: string | null;
  date: string | null;
  type: TimeRequestType | null;
  minutes: number | null;
  created_at: string | null;
  updated_at: string | null;
  time_request_reviewers?: TimeRequestReviewerRow[] | null;
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toRoleScopeLabel = (scope: RoleScope) => {
  if (scope === "director") {
    return "Giám đốc";
  }
  if (scope === "leader") {
    return "Trưởng nhóm";
  }
  return "Thành viên";
};

const toRequestTypeLabel = (type: TimeRequestType | null | undefined) => {
  if (type === "leave") {
    return "Xin nghỉ";
  }
  if (type === "late") {
    return "Đi muộn";
  }
  if (type === "overtime") {
    return "Tăng ca";
  }
  return "Khác";
};

const formatDateVi = (value: string | null) => {
  if (!value) {
    return "--";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(date);
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const toRequestStatus = (reviewers: TimeRequestReviewerRow[] | null | undefined): RequestStatus => {
  if (!reviewers || reviewers.length === 0) {
    return "pending";
  }
  if (reviewers.some((item) => item.is_approved === false)) {
    return "rejected";
  }
  if (reviewers.every((item) => item.is_approved === true)) {
    return "approved";
  }
  return "pending";
};

function StatusBadge({ status }: { status: RequestStatus }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Đã duyệt
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Từ chối
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Chờ duyệt
    </span>
  );
}

export default function TimeRequestManagementPage() {
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [roleScope, setRoleScope] = useState<RoleScope>("member");
  const [requests, setRequests] = useState<TimeRequestRow[]>([]);
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [reloadSeed, setReloadSeed] = useState<number>(0);

  useEffect(() => {
    let isActive = true;

    const loadRequests = async () => {
      setIsLoading(true);
      setLoadError(null);
      setActionError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          throw new Error("Không xác thực được người dùng.");
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError || !profileData?.id) {
          throw new Error(profileError?.message ?? "Không tìm thấy hồ sơ người dùng.");
        }

        const viewerProfileId = String(profileData.id);

        if (!isActive) {
          return;
        }
        setCurrentProfileId(viewerProfileId);

        const { data: rolesData, error: rolesError } = await supabase.from("roles").select("id,name");
        if (rolesError) {
          throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
        }

        const typedRoles = (rolesData ?? []) as RoleRow[];
        const directorRoleIds = typedRoles
          .filter((role) => {
            const roleName = normalizeText(role.name);
            return roleName === "giam doc" || roleName.includes("giam doc") || roleName === "director";
          })
          .map((role) => String(role.id));
        const leaderRoleIds = typedRoles
          .filter((role) => {
            const roleName = normalizeText(role.name);
            return roleName === "leader" || roleName.includes("leader") || roleName.includes("truong nhom");
          })
          .map((role) => String(role.id));
        const memberRoleIds = typedRoles
          .filter((role) => {
            const roleName = normalizeText(role.name);
            return roleName === "member" || roleName.includes("member") || roleName.includes("thanh vien");
          })
          .map((role) => String(role.id));

        const { data: currentUserRolesData, error: currentUserRolesError } = await supabase
          .from("user_role_in_department")
          .select("profile_id,department_id,role_id")
          .eq("profile_id", viewerProfileId);

        if (currentUserRolesError) {
          throw new Error(currentUserRolesError.message || "Không tải được vai trò hiện tại.");
        }

        const currentUserRoles = (currentUserRolesData ?? []) as UserRoleRow[];
        const hasDirectorRole = currentUserRoles.some(
          (row) => row.role_id && directorRoleIds.includes(String(row.role_id)),
        );
        const hasLeaderRole = currentUserRoles.some(
          (row) => row.role_id && leaderRoleIds.includes(String(row.role_id)),
        );

        let scopedRole: RoleScope = "member";
        if (hasDirectorRole) {
          scopedRole = "director";
        } else if (hasLeaderRole) {
          scopedRole = "leader";
        }

        if (!isActive) {
          return;
        }
        setRoleScope(scopedRole);

        let subordinateProfileIds: string[] | null = null;
        if (scopedRole === "member") {
          subordinateProfileIds = [];
        } else if (scopedRole === "leader") {
          const ownLeaderDepartmentIds = [
            ...new Set(
              currentUserRoles
                .filter((row) => row.department_id && row.role_id && leaderRoleIds.includes(String(row.role_id)))
                .map((row) => String(row.department_id)),
            ),
          ];

          if (ownLeaderDepartmentIds.length === 0) {
            subordinateProfileIds = [];
          } else {
            const { data: allDepartmentsData, error: allDepartmentsError } = await supabase
              .from("departments")
              .select("id,parent_department_id");

            if (allDepartmentsError) {
              throw new Error(allDepartmentsError.message || "Không tải được cây phòng ban.");
            }

            const typedDepartments = (allDepartmentsData ?? []) as DepartmentRow[];
            const childrenByParent = typedDepartments.reduce<Record<string, string[]>>((acc, department) => {
              const parentId = department.parent_department_id ? String(department.parent_department_id) : null;
              if (!parentId) {
                return acc;
              }
              if (!acc[parentId]) {
                acc[parentId] = [];
              }
              acc[parentId].push(String(department.id));
              return acc;
            }, {});

            const scopedDepartmentIds = new Set<string>(ownLeaderDepartmentIds);
            const queue = [...ownLeaderDepartmentIds];
            while (queue.length > 0) {
              const departmentId = queue.shift() as string;
              const children = childrenByParent[departmentId] ?? [];
              children.forEach((childId) => {
                if (scopedDepartmentIds.has(childId)) {
                  return;
                }
                scopedDepartmentIds.add(childId);
                queue.push(childId);
              });
            }

            const effectiveRoleIds = [...new Set([...leaderRoleIds, ...memberRoleIds])];
            if (effectiveRoleIds.length === 0) {
              subordinateProfileIds = [];
            } else {
              const { data: scopedUserRolesData, error: scopedUserRolesError } = await supabase
                .from("user_role_in_department")
                .select("profile_id,department_id,role_id")
                .in("department_id", Array.from(scopedDepartmentIds))
                .in("role_id", effectiveRoleIds);

              if (scopedUserRolesError) {
                throw new Error(scopedUserRolesError.message || "Không tải được danh sách cấp dưới.");
              }

              subordinateProfileIds = [
                ...new Set(
                  ((scopedUserRolesData ?? []) as UserRoleRow[])
                    .map((row) => row.profile_id)
                    .filter(Boolean)
                    .map((item) => String(item))
                    .filter((item) => item !== viewerProfileId),
                ),
              ];
            }
          }
        }

        const requestsQuery = supabase
          .from("time_requests")
          .select(
            "id,profile_id,date,type,minutes,created_at,updated_at,time_request_reviewers(id,profile_id,is_approved,comment,reviewed_at,created_at)",
          )
          .order("created_at", { ascending: false });

        let requestRows: TimeRequestRow[] = [];
        if (scopedRole === "director") {
          const { data, error } = await requestsQuery.neq("profile_id", viewerProfileId);
          if (error) {
            throw new Error(error.message || "Không tải được yêu cầu thời gian.");
          }
          requestRows = (data ?? []) as TimeRequestRow[];
        } else {
          const targetProfileIds = subordinateProfileIds ?? [];
          if (targetProfileIds.length === 0) {
            requestRows = [];
          } else {
            const { data, error } = await requestsQuery.in("profile_id", targetProfileIds);
            if (error) {
              throw new Error(error.message || "Không tải được yêu cầu thời gian.");
            }
            requestRows = (data ?? []) as TimeRequestRow[];
          }
        }

        if (!isActive) {
          return;
        }
        setRequests(requestRows);

        const requesterProfileIds = [
          ...new Set(requestRows.map((row) => row.profile_id).filter(Boolean).map((item) => String(item))),
        ];

        if (requesterProfileIds.length === 0) {
          setProfileNameById({});
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id,name,email")
          .in("id", requesterProfileIds);

        if (profilesError) {
          throw new Error(profilesError.message || "Không tải được thông tin nhân sự.");
        }

        if (!isActive) {
          return;
        }

        const nameMap = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>((acc, profile) => {
          acc[String(profile.id)] = profile.name ? String(profile.name) : profile.email ? String(profile.email) : "Không rõ";
          return acc;
        }, {});
        setProfileNameById(nameMap);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Không tải được dữ liệu duyệt yêu cầu.");
        setRequests([]);
        setProfileNameById({});
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadRequests();

    return () => {
      isActive = false;
    };
  }, [reloadSeed]);

  const handleReviewRequest = async (requestId: string, isApproved: boolean) => {
    if (!currentProfileId) {
      return;
    }

    setProcessingRequestId(requestId);
    setActionError(null);

    try {
      const { data: existingRows, error: existingError } = await supabase
        .from("time_request_reviewers")
        .select("id")
        .eq("time_request_id", requestId)
        .eq("profile_id", currentProfileId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) {
        throw new Error(existingError.message || "Không thể kiểm tra lịch sử duyệt.");
      }

      const reviewedAt = new Date().toISOString();
      const existingId = existingRows?.[0]?.id ? String(existingRows[0].id) : null;

      if (existingId) {
        const { error: updateError } = await supabase
          .from("time_request_reviewers")
          .update({
            is_approved: isApproved,
            reviewed_at: reviewedAt,
          })
          .eq("id", existingId);

        if (updateError) {
          throw new Error(updateError.message || "Không thể cập nhật quyết định duyệt.");
        }
      } else {
        const { error: insertError } = await supabase.from("time_request_reviewers").insert({
          time_request_id: requestId,
          profile_id: currentProfileId,
          is_approved: isApproved,
          reviewed_at: reviewedAt,
        });

        if (insertError) {
          throw new Error(insertError.message || "Không thể lưu quyết định duyệt.");
        }
      }

      setReloadSeed((prev) => prev + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể duyệt yêu cầu.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const requestSummary = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((item) => toRequestStatus(item.time_request_reviewers) === "pending").length;
    const approved = requests.filter((item) => toRequestStatus(item.time_request_reviewers) === "approved").length;
    const rejected = requests.filter((item) => toRequestStatus(item.time_request_reviewers) === "rejected").length;
    return { total, pending, approved, rejected };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (filter === "all") {
      return requests;
    }
    return requests.filter((item) => toRequestStatus(item.time_request_reviewers) === filter);
  }, [filter, requests]);

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timeRequestManagement" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Quản lý yêu cầu thời gian</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Duyệt yêu cầu thời gian</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Vai trò hiện tại: <span className="font-semibold text-slate-700">{toRoleScopeLabel(roleScope)}</span>
                </p>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="grid gap-4 md:grid-cols-4">
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Tổng yêu cầu</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-900">{requestSummary.total}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Chờ duyệt</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-amber-600">{requestSummary.pending}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Đã duyệt</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-emerald-600">{requestSummary.approved}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">Đã từ chối</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-rose-600">{requestSummary.rejected}</p>
              </article>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <h2 className="text-2xl font-semibold text-slate-900">Danh sách yêu cầu</h2>
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      filter === "all" ? "bg-white text-slate-700" : "text-slate-500"
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("pending")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      filter === "pending" ? "bg-white text-slate-700" : "text-slate-500"
                    }`}
                  >
                    Chờ duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("approved")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      filter === "approved" ? "bg-white text-slate-700" : "text-slate-500"
                    }`}
                  >
                    Đã duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("rejected")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      filter === "rejected" ? "bg-white text-slate-700" : "text-slate-500"
                    }`}
                  >
                    Từ chối
                  </button>
                </div>
              </div>

              {actionError ? (
                <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{actionError}</div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-left">
                  <thead>
                    <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                      <th className="px-5 py-3 font-semibold">Nhân sự</th>
                      <th className="px-5 py-3 font-semibold">Ngày cần sửa</th>
                      <th className="px-5 py-3 font-semibold">Loại</th>
                      <th className="px-5 py-3 font-semibold">Số phút</th>
                      <th className="px-5 py-3 font-semibold">Ngày gửi</th>
                      <th className="px-5 py-3 font-semibold">Trạng thái</th>
                      <th className="px-5 py-3 font-semibold">Bạn đã duyệt</th>
                      <th className="px-5 py-3 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                          Đang tải yêu cầu thời gian...
                        </td>
                      </tr>
                    ) : loadError ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={8} className="px-5 py-8 text-center text-sm text-rose-600">
                          {loadError}
                        </td>
                      </tr>
                    ) : roleScope === "member" ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                          Bạn chưa có phạm vi duyệt yêu cầu của cấp dưới.
                        </td>
                      </tr>
                    ) : filteredRequests.length === 0 ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                          Chưa có yêu cầu thời gian trong phạm vi hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((item) => {
                        const reviewers = item.time_request_reviewers ?? [];
                        const myReview = currentProfileId
                          ? reviewers.find((reviewer) => reviewer.profile_id === currentProfileId) ?? null
                          : null;
                        const status = toRequestStatus(reviewers);
                        const isApproving = processingRequestId === item.id;
                        return (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="px-5 py-4 text-sm text-slate-700">
                              {item.profile_id ? profileNameById[item.profile_id] ?? item.profile_id : "--"}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatDateVi(item.date)}</td>
                            <td className="px-5 py-4 text-sm text-slate-700">{toRequestTypeLabel(item.type)}</td>
                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {typeof item.minutes === "number" ? `${item.minutes} phút` : "--"}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(item.created_at)}</td>
                            <td className="px-5 py-4">
                              <StatusBadge status={status} />
                            </td>
                            <td className="px-5 py-4 text-xs">
                              {myReview ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${
                                    myReview.is_approved === true
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {myReview.is_approved === true ? "Đã duyệt" : "Đã từ chối"}
                                </span>
                              ) : (
                                <span className="text-slate-400">Chưa duyệt</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={isApproving}
                                  onClick={() => void handleReviewRequest(item.id, false)}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Từ chối
                                </button>
                                <button
                                  type="button"
                                  disabled={isApproving}
                                  onClick={() => void handleReviewRequest(item.id, true)}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Duyệt
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
