"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

type RequestTypeValue = "late-checkin" | "early-checkout" | "missing-punch" | "overtime";

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

const requestTypeOptions = [
  { value: "late-checkin", label: "Check-in trễ" },
  { value: "early-checkout", label: "Check-out sớm" },
  { value: "missing-punch", label: "Thiếu lượt chấm công" },
  { value: "overtime", label: "Khai báo tăng ca" },
] as const satisfies Array<{ value: RequestTypeValue; label: string }>;

const WORK_START_MINUTES = 8 * 60 + 10;
const WORK_END_MINUTES = 17 * 60 + 30;
const FULL_WORK_MINUTES = 8 * 60;

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toMinutesFromHHmm = (value: string) => {
  const [hhRaw, mmRaw] = value.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return 0;
  }
  return hh * 60 + mm;
};

const getAncestors = (
  startDepartmentIds: string[],
  parentDepartmentById: Record<string, string | null>,
  includeSelf: boolean,
) => {
  const scoped = new Set<string>();
  startDepartmentIds.forEach((startId) => {
    let cursor: string | null = startId;
    let isFirst = true;
    while (cursor) {
      if ((includeSelf || !isFirst) && !scoped.has(cursor)) {
        scoped.add(cursor);
      }
      cursor = parentDepartmentById[cursor] ?? null;
      isFirst = false;
    }
  });
  return Array.from(scoped);
};

export default function CreateTimeRequestPage() {
  const router = useRouter();
  const [requestType, setRequestType] = useState<RequestTypeValue | "">("");
  const [correctionDate, setCorrectionDate] = useState<Date | undefined>(new Date());
  const [checkInTime, setCheckInTime] = useState<string>("09:00");
  const [checkOutTime, setCheckOutTime] = useState<string>("18:00");
  const [formError, setFormError] = useState<string>("");
  const [submitSuccess, setSubmitSuccess] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const getPayloadByRequestType = (type: RequestTypeValue) => {
    if (type === "late-checkin") {
      const lateMinutes = Math.max(0, toMinutesFromHHmm(checkInTime) - WORK_START_MINUTES);
      return { type: "late" as const, minutes: lateMinutes };
    }
    if (type === "early-checkout") {
      const missingMinutes = Math.max(0, WORK_END_MINUTES - toMinutesFromHHmm(checkOutTime));
      return { type: "leave" as const, minutes: missingMinutes };
    }
    if (type === "missing-punch") {
      return { type: "leave" as const, minutes: FULL_WORK_MINUTES };
    }
    const overtimeMinutes = Math.max(0, toMinutesFromHHmm(checkOutTime) - WORK_END_MINUTES);
    return { type: "overtime" as const, minutes: overtimeMinutes };
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setSubmitSuccess("");

    if (!requestType) {
      setFormError("Vui lòng chọn loại yêu cầu.");
      return;
    }
    if (!correctionDate) {
      setFormError("Vui lòng chọn ngày cần điều chỉnh.");
      return;
    }

    setIsSubmitting(true);

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

      const requesterProfileId = String(profileData.id);

      const [{ data: rolesData, error: rolesError }, { data: requesterRolesData, error: requesterRolesError }] =
        await Promise.all([
          supabase.from("roles").select("id,name"),
          supabase
            .from("user_role_in_department")
            .select("profile_id,department_id,role_id")
            .eq("profile_id", requesterProfileId),
        ]);

      if (rolesError) {
        throw new Error(rolesError.message || "Không tải được danh sách vai trò.");
      }
      if (requesterRolesError) {
        throw new Error(requesterRolesError.message || "Không tải được vai trò của người tạo yêu cầu.");
      }

      const typedRoles = (rolesData ?? []) as RoleRow[];
      const typedRequesterRoles = (requesterRolesData ?? []) as UserRoleRow[];

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
      const directorRoleIds = typedRoles
        .filter((role) => {
          const roleName = normalizeText(role.name);
          return roleName === "giam doc" || roleName.includes("giam doc") || roleName === "director";
        })
        .map((role) => String(role.id));

      const hasDirectorRole = typedRequesterRoles.some(
        (row) => row.role_id && directorRoleIds.includes(String(row.role_id)),
      );
      const hasLeaderRole = typedRequesterRoles.some(
        (row) => row.role_id && leaderRoleIds.includes(String(row.role_id)),
      );
      const requesterScope: "member" | "leader" | "director" = hasDirectorRole
        ? "director"
        : hasLeaderRole
          ? "leader"
          : "member";

      const { data: departmentsData, error: departmentsError } = await supabase
        .from("departments")
        .select("id,parent_department_id");
      if (departmentsError) {
        throw new Error(departmentsError.message || "Không tải được cây phòng ban.");
      }

      const parentDepartmentById = ((departmentsData ?? []) as DepartmentRow[]).reduce<Record<string, string | null>>(
        (acc, item) => {
          acc[String(item.id)] = item.parent_department_id ? String(item.parent_department_id) : null;
          return acc;
        },
        {},
      );

      let reviewerProfileIds: string[] = [];

      if (requesterScope === "member") {
        const currentDepartmentIds = [
          ...new Set(
            typedRequesterRoles
              .filter((row) => row.department_id && row.role_id && memberRoleIds.includes(String(row.role_id)))
              .map((row) => String(row.department_id)),
          ),
        ];
        const fallbackDepartmentIds =
          currentDepartmentIds.length > 0
            ? currentDepartmentIds
            : [
                ...new Set(
                  typedRequesterRoles
                    .map((row) => row.department_id)
                    .filter(Boolean)
                    .map((item) => String(item)),
                ),
              ];

        const scopedDepartmentIds = getAncestors(fallbackDepartmentIds, parentDepartmentById, true);

        if (leaderRoleIds.length > 0 && scopedDepartmentIds.length > 0) {
          const { data: reviewerRows, error: reviewerError } = await supabase
            .from("user_role_in_department")
            .select("profile_id")
            .in("department_id", scopedDepartmentIds)
            .in("role_id", leaderRoleIds);

          if (reviewerError) {
            throw new Error(reviewerError.message || "Không tải được danh sách Leader duyệt yêu cầu.");
          }

          reviewerProfileIds = [
            ...new Set(
              (reviewerRows ?? [])
                .map((row) => row.profile_id)
                .filter(Boolean)
                .map((item) => String(item))
                .filter((item) => item !== requesterProfileId),
            ),
          ];
        }
      } else if (requesterScope === "leader") {
        const ownLeaderDepartmentIds = [
          ...new Set(
            typedRequesterRoles
              .filter((row) => row.department_id && row.role_id && leaderRoleIds.includes(String(row.role_id)))
              .map((row) => String(row.department_id)),
          ),
        ];

        const parentDepartmentIds = getAncestors(ownLeaderDepartmentIds, parentDepartmentById, false);
        let parentLeaders: string[] = [];
        if (leaderRoleIds.length > 0 && parentDepartmentIds.length > 0) {
          const { data: parentLeaderRows, error: parentLeaderError } = await supabase
            .from("user_role_in_department")
            .select("profile_id")
            .in("department_id", parentDepartmentIds)
            .in("role_id", leaderRoleIds);

          if (parentLeaderError) {
            throw new Error(parentLeaderError.message || "Không tải được Leader phòng ban cha.");
          }

          parentLeaders = [
            ...new Set(
              (parentLeaderRows ?? [])
                .map((row) => row.profile_id)
                .filter(Boolean)
                .map((item) => String(item)),
            ),
          ];
        }

        let directorReviewers: string[] = [];
        if (directorRoleIds.length > 0) {
          const { data: directorRows, error: directorError } = await supabase
            .from("user_role_in_department")
            .select("profile_id")
            .in("role_id", directorRoleIds);

          if (directorError) {
            throw new Error(directorError.message || "Không tải được người duyệt vai trò Giám đốc.");
          }

          directorReviewers = [
            ...new Set(
              (directorRows ?? [])
                .map((row) => row.profile_id)
                .filter(Boolean)
                .map((item) => String(item)),
            ),
          ];
        }

        reviewerProfileIds = [...new Set([...parentLeaders, ...directorReviewers])].filter(
          (item) => item !== requesterProfileId,
        );
      }

      if ((requesterScope === "member" || requesterScope === "leader") && reviewerProfileIds.length === 0) {
        throw new Error("Không tìm thấy người duyệt phù hợp theo cấu hình phòng ban hiện tại.");
      }

      const requestPayload = getPayloadByRequestType(requestType);
      const { data: createdRequest, error: createRequestError } = await supabase
        .from("time_requests")
        .insert({
          profile_id: requesterProfileId,
          date: toIsoDate(correctionDate),
          type: requestPayload.type,
          minutes: requestPayload.minutes,
        })
        .select("id")
        .maybeSingle();

      if (createRequestError || !createdRequest?.id) {
        throw new Error(createRequestError?.message || "Không thể tạo yêu cầu thời gian.");
      }

      if (reviewerProfileIds.length > 0) {
        const reviewerPayload = reviewerProfileIds.map((reviewerProfileId) => ({
          time_request_id: String(createdRequest.id),
          profile_id: reviewerProfileId,
        }));

        const { error: insertReviewerError } = await supabase.from("time_request_reviewers").insert(reviewerPayload);
        if (insertReviewerError) {
          throw new Error(insertReviewerError.message || "Không thể tạo danh sách người duyệt.");
        }
      }

      setSubmitSuccess("Tạo yêu cầu thành công.");
      router.push("/timesheet");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể gửi yêu cầu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timesheet" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                <Link href="/timesheet" className="hover:text-slate-700">
                  Chấm công
                </Link>
                <span className="px-2">›</span>
                <span>Yêu cầu công</span>
                <span className="px-2">›</span>
                <span className="font-semibold text-slate-700">Tạo mới</span>
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">
                Tạo yêu cầu điều chỉnh công
              </h1>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            <section className="mx-auto w-full max-w-[920px] rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
              <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
                {formError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {formError}
                  </div>
                ) : null}
                {submitSuccess ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {submitSuccess}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Loại yêu cầu</label>
                  <Select value={requestType || undefined} onValueChange={setRequestType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại yêu cầu" />
                    </SelectTrigger>
                    <SelectContent>
                      {requestTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">Chọn ngày cần điều chỉnh</p>
                  <div className="max-w-[280px]">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-11 w-full justify-start rounded-xl border-slate-200 px-3 text-left text-sm"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                          {correctionDate
                            ? format(correctionDate, "dd/MM/yyyy", { locale: vi })
                            : "Chọn ngày"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={correctionDate}
                          onSelect={setCorrectionDate}
                          locale={vi}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Giờ vào cần chỉnh</label>
                    <input
                      type="time"
                      value={checkInTime}
                      onChange={(event) => setCheckInTime(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Giờ ra cần chỉnh</label>
                    <input
                      type="time"
                      value={checkOutTime}
                      onChange={(event) => setCheckOutTime(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-800">Lý do điều chỉnh</label>
                  <textarea
                    rows={5}
                    placeholder="Mô tả ngắn gọn lý do cần điều chỉnh..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                  <Link
                    href="/timesheet"
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hủy
                  </Link>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? "Đang gửi..." : "Gửi yêu cầu"}
                  </button>
                </div>
              </form>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
