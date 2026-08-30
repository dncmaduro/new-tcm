"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  UnlockKeyhole,
  UserRound,
  UsersRound,
} from "lucide-react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  is_active: boolean | null;
  is_timekeeping_enabled: boolean | null;
  is_parttime: boolean | null;
};
type Department = { id: string; name: string };
type Role = { id: string; name: string | null };
type Membership = { profile_id: string | null; department_id: string | null; role_id: string | null };
type ReviewerOverride = { requester_profile_id: string; reviewer_profile_id: string };
type Directory = { profiles: Profile[]; departments: Department[]; roles: Role[]; memberships: Membership[]; reviewerOverrides: ReviewerOverride[] };
type StatusFilter = "all" | "active" | "inactive";

const initialDirectory: Directory = { profiles: [], departments: [], roles: [], memberships: [], reviewerOverrides: [] };
const emptyCreateForm = { name: "", email: "", password: "", departmentId: "", roleId: "" };

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  return data.session.access_token;
}

async function itAdminFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Không thể thực hiện yêu cầu.");
  }
  return payload;
}

function ToggleField({ checked, label, description, onChange }: { checked: boolean; label: string; description?: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-3.5 transition hover:border-slate-300">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function ITAdminPageContent() {
  const [accessState, setAccessState] = useState<"loading" | "allowed" | "denied">("loading");
  const [directory, setDirectory] = useState<Directory>(initialDirectory);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [assignmentProfile, setAssignmentProfile] = useState<Profile | null>(null);
  const [reviewerOverrideProfile, setReviewerOverrideProfile] = useState<Profile | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editForm, setEditForm] = useState({ name: "", isActive: true, isTimekeepingEnabled: false, isParttime: false });
  const [assignment, setAssignment] = useState({ departmentId: "", roleId: "" });
  const [reviewerProfileIds, setReviewerProfileIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [isSavingReviewerOverrides, setIsSavingReviewerOverrides] = useState(false);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [timekeepingDisableConfirmation, setTimekeepingDisableConfirmation] = useState<{
    profile: Profile;
    source: "edit" | "quick";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    const data = await itAdminFetch("/api/it-admin/directory");
    setDirectory({
      profiles: Array.isArray(data.profiles) ? (data.profiles as Profile[]) : [],
      departments: Array.isArray(data.departments) ? (data.departments as Department[]) : [],
      roles: Array.isArray(data.roles) ? (data.roles as Role[]) : [],
      memberships: Array.isArray(data.memberships) ? (data.memberships as Membership[]) : [],
      reviewerOverrides: Array.isArray(data.reviewerOverrides) ? (data.reviewerOverrides as ReviewerOverride[]) : [],
    });
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const access = await itAdminFetch("/api/it-admin/access");
        if (!active) return;
        if (access.allowed !== true) {
          setAccessState("denied");
          setLoadError(access.configured === false ? "Chưa cấu hình IT_EMAIL trên server." : null);
          return;
        }
        setAccessState("allowed");
        await loadDirectory();
      } catch (error) {
        if (!active) return;
        setAccessState("denied");
        setLoadError(error instanceof Error ? error.message : "Không thể kiểm tra quyền quản trị IT.");
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [loadDirectory]);

  const membershipsByProfileId = useMemo(() => {
    return directory.memberships.reduce<Record<string, Membership[]>>((result, membership) => {
      if (membership.profile_id) (result[membership.profile_id] ??= []).push(membership);
      return result;
    }, {});
  }, [directory.memberships]);
  const departmentNameById = useMemo(
    () => Object.fromEntries(directory.departments.map((department) => [department.id, department.name])),
    [directory.departments],
  );
  const roleNameById = useMemo(
    () => Object.fromEntries(directory.roles.map((role) => [role.id, role.name || "Chưa gán vai trò"])),
    [directory.roles],
  );
  const reviewerProfileIdsByRequesterId = useMemo(() => {
    return directory.reviewerOverrides.reduce<Record<string, string[]>>((result, item) => {
      (result[item.requester_profile_id] ??= []).push(item.reviewer_profile_id);
      return result;
    }, {});
  }, [directory.reviewerOverrides]);
  const filteredProfiles = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return directory.profiles.filter((profile) => {
      const isActive = profile.is_active !== false;
      const profileMemberships = membershipsByProfileId[profile.id] ?? [];
      const matchesKeyword = !normalizedKeyword || [profile.name, profile.email].some((value) => value?.toLowerCase().includes(normalizedKeyword));
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isActive : !isActive);
      const matchesDepartment = departmentFilter === "all" || profileMemberships.some((item) => item.department_id === departmentFilter);
      return matchesKeyword && matchesStatus && matchesDepartment;
    });
  }, [departmentFilter, directory.profiles, keyword, membershipsByProfileId, statusFilter]);

  const membershipLabel = (membership: Membership) => (
    `${departmentNameById[membership.department_id || ""] || "Phòng ban đã xoá"} · ${roleNameById[membership.role_id || ""] || "Chưa gán vai trò"}`
  );

  const resetMessages = () => {
    setActionError(null);
    setNotice(null);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    if (Boolean(createForm.departmentId) !== Boolean(createForm.roleId)) {
      setActionError("Hãy chọn cả phòng ban và vai trò, hoặc bỏ trống cả hai.");
      return;
    }
    setIsCreating(true);
    try {
      await itAdminFetch("/api/it-admin/users", { method: "POST", body: JSON.stringify(createForm) });
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      setNotice("Đã tạo tài khoản và xác nhận email tự động.");
      await loadDirectory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể tạo tài khoản.");
    } finally {
      setIsCreating(false);
    }
  };

  const openEdit = (profile: Profile) => {
    resetMessages();
    setEditProfile(profile);
    setEditForm({ name: profile.name || "", isActive: profile.is_active !== false, isTimekeepingEnabled: profile.is_timekeeping_enabled === true, isParttime: profile.is_parttime === true });
  };

  const saveEdit = async () => {
    if (!editProfile) return;
    resetMessages();
    setIsSavingEdit(true);
    try {
      await itAdminFetch("/api/it-admin/users", {
        method: "PATCH",
        body: JSON.stringify({ profileId: editProfile.id, ...editForm }),
      });
      setEditProfile(null);
      setNotice("Đã cập nhật thông tin và quyền thao tác của nhân sự.");
      await loadDirectory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật nhân sự.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSaveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editProfile) return;

    if (editProfile.is_timekeeping_enabled === true && !editForm.isTimekeepingEnabled) {
      setTimekeepingDisableConfirmation({ profile: editProfile, source: "edit" });
      return;
    }

    void saveEdit();
  };

  const updateProfileFlag = async (profile: Profile, updates: Record<string, boolean>, successMessage: string) => {
    resetMessages();
    setSavingProfileId(profile.id);
    try {
      await itAdminFetch("/api/it-admin/users", { method: "PATCH", body: JSON.stringify({ profileId: profile.id, ...updates }) });
      setNotice(successMessage);
      await loadDirectory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật nhân sự.");
    } finally {
      setSavingProfileId(null);
    }
  };

  const handleTimekeepingToggle = (profile: Profile) => {
    if (profile.is_timekeeping_enabled === true) {
      setTimekeepingDisableConfirmation({ profile, source: "quick" });
      return;
    }

    void updateProfileFlag(profile, { isTimekeepingEnabled: true }, "Đã bật quyền chấm công.");
  };

  const confirmTimekeepingDisable = () => {
    const pending = timekeepingDisableConfirmation;
    if (!pending) return;

    setTimekeepingDisableConfirmation(null);
    if (pending.source === "edit") {
      void saveEdit();
      return;
    }

    void updateProfileFlag(
      pending.profile,
      { isTimekeepingEnabled: false },
      "Đã tắt chấm công và ngắt liên kết chấm công.",
    );
  };

  const openAssignment = (profile: Profile) => {
    resetMessages();
    setAssignmentProfile(profile);
    const currentAssignment = membershipsByProfileId[profile.id]?.[0];
    setAssignment({
      departmentId: currentAssignment?.department_id || "",
      roleId: currentAssignment?.role_id || "",
    });
  };

  const handleSaveAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignmentProfile) return;
    resetMessages();
    setIsSavingAssignment(true);
    try {
      await itAdminFetch("/api/it-admin/memberships", {
        method: "POST",
        body: JSON.stringify({ profileId: assignmentProfile.id, ...assignment }),
      });
      setAssignmentProfile(null);
      setNotice("Đã lưu phân quyền phòng ban và vai trò.");
      await loadDirectory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể gán phòng ban.");
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const openReviewerOverride = (profile: Profile) => {
    resetMessages();
    setReviewerOverrideProfile(profile);
    setReviewerProfileIds(reviewerProfileIdsByRequesterId[profile.id] ?? []);
  };

  const toggleReviewer = (profileId: string, checked: boolean) => {
    setReviewerProfileIds((current) =>
      checked ? [...new Set([...current, profileId])] : current.filter((id) => id !== profileId),
    );
  };

  const saveReviewerOverride = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewerOverrideProfile) return;

    resetMessages();
    setIsSavingReviewerOverrides(true);
    try {
      await itAdminFetch("/api/it-admin/time-request-reviewer-overrides", {
        method: "PUT",
        body: JSON.stringify({
          requesterProfileId: reviewerOverrideProfile.id,
          reviewerProfileIds,
        }),
      });
      setReviewerOverrideProfile(null);
      setNotice(
        reviewerProfileIds.length
          ? "Đã lưu người duyệt form riêng cho nhân sự."
          : "Đã bỏ cấu hình riêng; form mới sẽ quay về người duyệt theo vai trò.",
      );
      await loadDirectory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể lưu người duyệt form.");
    } finally {
      setIsSavingReviewerOverrides(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <WorkspaceSidebar active="itAdmin" />
      <main className="min-h-screen lg:pl-[var(--workspace-sidebar-width)]">
        <WorkspacePageHeader title="Quản trị IT" items={[{ label: "Quản trị IT" }]} />
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
          {accessState === "loading" ? <div className="flex min-h-60 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Đang kiểm tra quyền truy cập...</div> : null}

          {accessState === "denied" ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-7 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-rose-600" />
              <h2 className="mt-3 text-xl font-bold text-rose-950">Không có quyền quản trị IT</h2>
              <p className="mt-2 text-sm text-rose-700">{loadError || "Chỉ tài khoản có email được khai báo trong IT_EMAIL mới có thể sử dụng khu vực này."}</p>
            </div>
          ) : null}

          {accessState === "allowed" ? (
            <>
              {actionError ? <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
              {notice ? <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />{notice}</p> : null}

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700"><UsersRound className="h-4 w-4" /></span><div><h2 className="font-bold text-slate-900">Nhân sự</h2><p className="text-sm text-slate-500">Quản lý tài khoản, phân quyền và quyền chấm công.</p></div></div>
                  </div>
                  <button type="button" onClick={() => { resetMessages(); setCreateOpen(true); }} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"><Plus className="h-4 w-4" />Tạo tài khoản</button>
                </div>

                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6 lg:flex-row lg:items-center">
                  <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm theo tên hoặc email..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
                  <div className="grid grid-cols-2 gap-3 lg:flex">
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"><option value="all">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option></select>
                    <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"><option value="all">Mọi phòng ban</option>{directory.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                  </div>
                </div>

                <div className="flex items-center justify-between px-5 py-3 text-sm text-slate-500 sm:px-6"><span><strong className="font-semibold text-slate-700">{filteredProfiles.length}</strong> / {directory.profiles.length} nhân sự</span><span className="hidden sm:inline">Thao tác nhanh ở cuối mỗi dòng</span></div>
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-left text-sm">
                    <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5 font-semibold sm:px-6">Nhân sự</th><th className="px-5 py-3.5 font-semibold">Phòng ban & vai trò</th><th className="px-5 py-3.5 font-semibold">Người duyệt form</th><th className="px-5 py-3.5 font-semibold">Hoạt động</th><th className="px-5 py-3.5 font-semibold">Chấm công</th><th className="w-14 px-5 py-3.5"><span className="sr-only">Thao tác</span></th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProfiles.map((profile) => {
                        const memberships = membershipsByProfileId[profile.id] ?? [];
                        const isActive = profile.is_active !== false;
                        const isTimekeepingEnabled = profile.is_timekeeping_enabled === true;
                        const isSaving = savingProfileId === profile.id;
                        const overrideReviewerIds = reviewerProfileIdsByRequesterId[profile.id] ?? [];
                        const overrideReviewerNames = overrideReviewerIds.map((id) => {
                          const reviewer = directory.profiles.find((item) => item.id === id);
                          return reviewer?.name || reviewer?.email || "Không rõ";
                        });
                        return <tr key={profile.id} className="transition hover:bg-slate-50/80">
                          <td className="px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><UserRound className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{profile.name || "Chưa đặt tên"}</p><p className="mt-0.5 truncate text-slate-500">{profile.email || "Chưa có email"}</p></div></div></td>
                          <td className="max-w-[330px] px-5 py-4 text-slate-600">{memberships.length ? <div className="space-y-1">{memberships.map((membership) => <p key={`${membership.department_id}-${membership.role_id}`} className="truncate">{membershipLabel(membership)}</p>)}</div> : <span className="text-slate-400">Chưa phân quyền</span>}</td>
                          <td className="max-w-[260px] px-5 py-4 text-slate-600">{overrideReviewerNames.length ? <div><p className="truncate font-medium text-violet-700">{overrideReviewerNames.join(", ")}</p><p className="mt-0.5 text-xs text-violet-600">Cấu hình riêng</p></div> : <span className="text-slate-400">Theo vai trò</span>}</td>
                          <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{isActive ? "Đang hoạt động" : "Đã khóa"}</span></td>
                          <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isTimekeepingEnabled ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{isTimekeepingEnabled ? "Đã bật" : "Đang tắt"}</span></td>
                          <td className="px-5 py-4 text-right"><Popover><PopoverTrigger asChild><button type="button" aria-label={`Thao tác với ${profile.name || profile.email || "nhân sự"}`} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"><MoreHorizontal className="h-5 w-5" /></button></PopoverTrigger><PopoverContent align="end" className="w-56 p-1.5"><div className="space-y-0.5"><button type="button" onClick={() => openEdit(profile)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"><Pencil className="h-4 w-4 text-slate-500" />Chỉnh sửa</button><button type="button" onClick={() => openAssignment(profile)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"><ShieldCheck className="h-4 w-4 text-slate-500" />Phân quyền</button><button type="button" onClick={() => openReviewerOverride(profile)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"><ClipboardCheck className="h-4 w-4 text-violet-600" />Người duyệt form</button><div className="my-1 border-t border-slate-100" /><button type="button" disabled={isSaving} onClick={() => void updateProfileFlag(profile, { isActive: !isActive }, isActive ? "Đã khóa nhân sự và ngắt liên kết chấm công." : "Đã mở lại trạng thái hoạt động của nhân sự.")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60">{isActive ? <LockKeyhole className="h-4 w-4 text-rose-600" /> : <UnlockKeyhole className="h-4 w-4 text-emerald-600" />}{isActive ? "Khóa hoạt động" : "Mở khóa hoạt động"}</button><button type="button" disabled={isSaving} onClick={() => handleTimekeepingToggle(profile)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"><Clock3 className="h-4 w-4 text-blue-600" />{isTimekeepingEnabled ? "Tắt chấm công" : "Bật chấm công"}</button></div></PopoverContent></Popover></td>
                        </tr>;
                      })}
                      {filteredProfiles.length === 0 ? <tr><td colSpan={6} className="px-6 py-14 text-center"><UsersRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">Không tìm thấy nhân sự phù hợp</p><p className="mt-1 text-slate-500">Thử thay đổi từ khóa hoặc bộ lọc.</p></td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Tạo tài khoản mới</DialogTitle><DialogDescription>Tài khoản sẽ được xác nhận email ngay khi tạo. Bạn có thể gán phòng ban và vai trò ngay tại đây hoặc sau đó.</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Họ và tên<input required value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500" placeholder="Nguyễn Văn A" /></label><label className="text-sm font-semibold text-slate-700">Email<input required type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500" placeholder="name@company.com" /></label></div>
            <label className="block text-sm font-semibold text-slate-700">Mật khẩu<input required minLength={8} type="password" autoComplete="new-password" value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500" placeholder="Tối thiểu 8 ký tự" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Phòng ban <span className="font-normal text-slate-400">(tuỳ chọn)</span><select value={createForm.departmentId} onChange={(event) => setCreateForm((current) => ({ ...current, departmentId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-blue-500"><option value="">Chưa gán</option>{directory.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Vai trò <span className="font-normal text-slate-400">(tuỳ chọn)</span><select value={createForm.roleId} onChange={(event) => setCreateForm((current) => ({ ...current, roleId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-blue-500"><option value="">Chưa gán</option>{directory.roles.map((role) => <option key={role.id} value={role.id}>{role.name || "Chưa đặt tên"}</option>)}</select></label></div>
            <DialogFooter><button type="button" onClick={() => setCreateOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Hủy</button><button disabled={isCreating} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300"><KeyRound className="h-4 w-4" />{isCreating ? "Đang tạo..." : "Tạo tài khoản"}</button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editProfile)} onOpenChange={(open) => !open && setEditProfile(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Chỉnh sửa nhân sự</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4"><label className="block text-sm font-semibold text-slate-700">Họ và tên<input required value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500" /></label><div className="space-y-3"><ToggleField checked={editForm.isActive} onChange={(checked) => setEditForm((current) => ({ ...current, isActive: checked }))} label="Cho phép hoạt động" /><ToggleField checked={editForm.isTimekeepingEnabled} onChange={(checked) => setEditForm((current) => ({ ...current, isTimekeepingEnabled: checked }))} label="Cho phép chấm công" description="Tắt chấm công sẽ ngắt liên kết mã chấm công của nhân sự này." /><ToggleField checked={editForm.isParttime} onChange={(checked) => setEditForm((current) => ({ ...current, isParttime: checked }))} label="Nhân viên part-time" /></div><DialogFooter><button type="button" onClick={() => setEditProfile(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Hủy</button><button disabled={isSavingEdit} className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:bg-blue-300">{isSavingEdit ? "Đang lưu..." : "Lưu thay đổi"}</button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(timekeepingDisableConfirmation)}
        onOpenChange={(open) => !open && setTimekeepingDisableConfirmation(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tắt chấm công?</DialogTitle>
            <DialogDescription>
              Bạn sắp tắt chấm công cho {timekeepingDisableConfirmation?.profile.name || timekeepingDisableConfirmation?.profile.email || "nhân sự này"}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Liên kết mã chấm công hiện tại sẽ bị ngắt và cần gán lại nếu muốn bật chấm công sau này. Lịch sử quẹt công cũ vẫn được giữ nguyên.
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setTimekeepingDisableConfirmation(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
              Hủy
            </button>
            <button type="button" onClick={confirmTimekeepingDisable} className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
              Vẫn tắt chấm công
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentProfile)} onOpenChange={(open) => !open && setAssignmentProfile(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Phân quyền nhân sự</DialogTitle><DialogDescription>Gán vai trò cho {assignmentProfile?.name || assignmentProfile?.email}. Chọn lại cùng phòng ban để thay vai trò hiện có.</DialogDescription></DialogHeader>
          <form onSubmit={handleSaveAssignment} className="space-y-4"><div className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600"><p className="font-semibold text-slate-700">Phân quyền hiện tại</p><div className="mt-1.5 space-y-1">{assignmentProfile && (membershipsByProfileId[assignmentProfile.id] ?? []).length ? (membershipsByProfileId[assignmentProfile.id] ?? []).map((membership) => <p key={`${membership.department_id}-${membership.role_id}`}>{membershipLabel(membership)}</p>) : <p>Chưa gán phòng ban.</p>}</div></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Phòng ban<select required value={assignment.departmentId} onChange={(event) => setAssignment((current) => ({ ...current, departmentId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-blue-500"><option value="">Chọn phòng ban</option>{directory.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Vai trò<select required value={assignment.roleId} onChange={(event) => setAssignment((current) => ({ ...current, roleId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-blue-500"><option value="">Chọn vai trò</option>{directory.roles.map((role) => <option key={role.id} value={role.id}>{role.name || "Chưa đặt tên"}</option>)}</select></label></div><DialogFooter><button type="button" onClick={() => setAssignmentProfile(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Hủy</button><button disabled={isSavingAssignment} className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:bg-violet-300">{isSavingAssignment ? "Đang lưu..." : "Lưu phân quyền"}</button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewerOverrideProfile)} onOpenChange={(open) => !open && setReviewerOverrideProfile(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Người duyệt form riêng</DialogTitle>
            <DialogDescription>
              Chọn người sẽ duyệt form điều chỉnh công của {reviewerOverrideProfile?.name || reviewerOverrideProfile?.email}. Cấu hình này thay hoàn toàn rule theo vai trò, chỉ áp dụng cho form tạo mới.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveReviewerOverride} className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-sm leading-6 text-violet-900">
              Không chọn ai để quay về người duyệt mặc định theo phòng ban/vai trò. Không thể chọn chính nhân sự này hoặc người đã bị khóa.
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {directory.profiles
                .filter((profile) => profile.id !== reviewerOverrideProfile?.id && profile.is_active === true)
                .map((profile) => {
                  const checked = reviewerProfileIds.includes(profile.id);
                  return <label key={profile.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50"><input type="checkbox" checked={checked} onChange={(event) => toggleReviewer(profile.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{profile.name || "Chưa đặt tên"}</span><span className="block truncate text-xs text-slate-500">{profile.email || "Chưa có email"}</span></span></label>;
                })}
            </div>
            <DialogFooter><button type="button" onClick={() => setReviewerOverrideProfile(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Hủy</button><button disabled={isSavingReviewerOverrides} className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:bg-violet-300">{isSavingReviewerOverrides ? "Đang lưu..." : "Lưu người duyệt"}</button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
