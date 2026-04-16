"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { supabase } from "@/lib/supabase";

type UserRoleDepartmentRow = {
  department_id: string | null;
  role_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type RoleRow = {
  id: string;
  name: string | null;
};

type RoleAssignment = {
  roleName: string;
  departmentName: string;
};

type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  avatar: string;
};

const defaultForm: ProfileForm = {
  fullName: "",
  email: "",
  phone: "",
  avatar: "",
};

const toStringValue = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value;
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Chưa có";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatDateOnly = (value: string | null) => {
  if (!value) {
    return "Chưa có";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
  }).format(date);
};

const toInitials = (value: string) => {
  const parts = value
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

const createImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Không thể đọc ảnh đã chọn.")));
    image.src = src;
  });

const getCroppedAvatarDataUrl = async (imageSrc: string, cropPixels: Area) => {
  const image = await createImage(imageSrc);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Không thể xử lý ảnh đã chọn.");
  }

  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    size,
    size
  );

  return canvas.toDataURL("image/jpeg", 0.92);
};

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(defaultForm);
  const [initialForm, setInitialForm] = useState<ProfileForm>(defaultForm);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [joinAt, setJoinAt] = useState<string | null>(null);
  const [leaveAt, setLeaveAt] = useState<string | null>(null);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setNotice(null);

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp hình ảnh hợp lệ.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("Ảnh đại diện tối đa 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Không thể đọc ảnh đã chọn.");
        return;
      }
      setCropPosition({ x: 0, y: 0 });
      setCropZoom(1);
      setCropPixels(null);
      setCropSource(reader.result);
    };
    reader.onerror = () => {
      setError("Không thể đọc ảnh đã chọn.");
    };
    reader.readAsDataURL(file);

    event.target.value = "";
  };

  const handleApplyAvatarCrop = async () => {
    if (!cropSource || !cropPixels) {
      setError("Vui lòng chọn vùng cắt ảnh.");
      return;
    }

    setIsApplyingCrop(true);
    setError(null);

    try {
      const croppedDataUrl = await getCroppedAvatarDataUrl(cropSource, cropPixels);
      setForm((prev) => ({
        ...prev,
        avatar: croppedDataUrl,
      }));
      setCropSource(null);
      setCropPixels(null);
      setNotice("Đã cập nhật ảnh đại diện (chưa lưu).");
    } catch (cropError) {
      const message = cropError instanceof Error ? cropError.message : "Không thể cắt ảnh.";
      setError(message);
    } finally {
      setIsApplyingCrop(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          if (!isActive) {
            return;
          }

          setError("Không xác thực được người dùng hiện tại.");
          setIsLoading(false);
          return;
        }

        const authUser = authData.user;

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,user_id,name,avatar,email,phone,join_at,leave_at,created_at,updated_at")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        if (profileError) {
          setError(profileError.message || "Không tải được hồ sơ người dùng.");
          setIsLoading(false);
          return;
        }

        const profile = (profileData as Record<string, unknown> | null) ?? null;
        const currentProfileId = profile?.id ? String(profile.id) : null;

        const fullName = toStringValue(profile?.name) || toStringValue(authUser.user_metadata?.name) || "Chưa đặt tên";
        const email = toStringValue(profile?.email) || toStringValue(authUser.email);
        const phone =
          toStringValue(profile?.phone) ||
          toStringValue(authUser.phone);
        const avatar =
          toStringValue(profile?.avatar) ||
          toStringValue(authUser.user_metadata?.avatar_url) ||
          toStringValue(authUser.user_metadata?.picture);

        const loadedForm: ProfileForm = {
          fullName,
          email,
          phone,
          avatar,
        };

        setForm(loadedForm);
        setInitialForm(loadedForm);

        setProfileId(currentProfileId);
        setCreatedAt(profile?.created_at ? String(profile.created_at) : null);
        setUpdatedAt(profile?.updated_at ? String(profile.updated_at) : null);
        setJoinAt(profile?.join_at ? String(profile.join_at) : null);
        setLeaveAt(profile?.leave_at ? String(profile.leave_at) : null);
        setLastSignInAt(authUser.last_sign_in_at ?? null);

        if (!currentProfileId) {
          setDepartmentNames([]);
          setRoleAssignments([]);
          setIsLoading(false);
          return;
        }

        const { data: userRoleRows, error: userRoleError } = await supabase
          .from("user_role_in_department")
          .select("department_id,role_id")
          .eq("profile_id", currentProfileId);

        if (!isActive) {
          return;
        }

        if (userRoleError) {
          setError("Không tải được thông tin phòng ban và vai trò.");
          setDepartmentNames([]);
          setRoleAssignments([]);
          setIsLoading(false);
          return;
        }

        const rows = (userRoleRows ?? []) as UserRoleDepartmentRow[];
        const departmentIds = [...new Set(rows.map((row) => row.department_id).filter(Boolean))] as string[];
        const roleIds = [...new Set(rows.map((row) => row.role_id).filter(Boolean))] as string[];

        const [departmentResult, roleResult] = await Promise.all([
          departmentIds.length
            ? supabase.from("departments").select("id,name").in("id", departmentIds)
            : Promise.resolve({ data: [], error: null }),
          roleIds.length
            ? supabase.from("roles").select("id,name").in("id", roleIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!isActive) {
          return;
        }

        const fetchedDepartments = ((departmentResult.data ?? []) as DepartmentRow[])
          .map((row) => ({
            id: String(row.id),
            name: String(row.name),
          }));
        const fetchedDepartmentNames = fetchedDepartments
          .map((row) => String(row.name))
          .sort((a, b) => a.localeCompare(b, "vi"));

        const departmentNameById = fetchedDepartments.reduce<Record<string, string>>((acc, row) => {
          acc[row.id] = row.name;
          return acc;
        }, {});
        const roleNameById = ((roleResult.data ?? []) as RoleRow[]).reduce<Record<string, string>>((acc, row) => {
          acc[String(row.id)] = String(row.name ?? "Thành viên");
          return acc;
        }, {});

        const seenAssignments = new Set<string>();
        const fetchedRoleAssignments = rows
          .map((row) => {
            const roleName = row.role_id ? roleNameById[row.role_id] ?? "Thành viên" : "Chưa gán vai trò";
            const departmentName = row.department_id
              ? departmentNameById[row.department_id] ?? "Không rõ phòng ban"
              : "Không thuộc phòng ban";
            return { roleName, departmentName };
          })
          .filter((item) => {
            const key = `${item.roleName}::${item.departmentName}`;
            if (seenAssignments.has(key)) {
              return false;
            }
            seenAssignments.add(key);
            return true;
          })
          .sort((a, b) => {
            const byRole = a.roleName.localeCompare(b.roleName, "vi");
            if (byRole !== 0) {
              return byRole;
            }
            return a.departmentName.localeCompare(b.departmentName, "vi");
          });

        setDepartmentNames(fetchedDepartmentNames);
        setRoleAssignments(fetchedRoleAssignments);

        if (departmentResult.error || roleResult.error) {
          setError("Không tải đầy đủ thông tin phòng ban hoặc vai trò.");
        }
      } catch {
        if (!isActive) {
          return;
        }
        setError("Có lỗi xảy ra khi tải hồ sơ cá nhân.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  const handleSaveProfile = async () => {
    setNotice(null);
    setError(null);

    const fullName = form.fullName.trim();
    if (!fullName) {
      setError("Họ và tên không được để trống.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setError("Không xác thực được người dùng hiện tại.");
        return;
      }

      const authUser = authData.user;
      const phone = form.phone.trim();
      const avatar = form.avatar.trim();

      if (!profileId) {
        const { data, error: insertError } = await supabase
          .from("profiles")
          .insert({
            user_id: authUser.id,
            name: fullName,
            email: form.email.trim() || authUser.email || null,
            phone: phone || null,
            avatar: avatar || null,
          })
          .select("id,created_at,updated_at")
          .maybeSingle();

        if (insertError) {
          setError(insertError.message || "Không thể tạo hồ sơ người dùng.");
          return;
        }

        setProfileId(data?.id ? String(data.id) : null);
        setCreatedAt(data?.created_at ? String(data.created_at) : createdAt);
        setUpdatedAt(data?.updated_at ? String(data.updated_at) : updatedAt);
      } else {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            name: fullName,
            phone: phone || null,
            avatar: avatar || null,
          })
          .eq("id", profileId);

        if (updateError) {
          setError(updateError.message || "Không thể lưu thay đổi hồ sơ.");
          return;
        }

        setUpdatedAt(new Date().toISOString());
      }

      setForm((prev) => ({
        ...prev,
        fullName,
        phone,
        avatar,
      }));
      setInitialForm((prev) => ({
        ...prev,
        fullName,
        phone,
        avatar,
      }));
      setIsEditing(false);
      setNotice("Đã lưu thông tin hồ sơ.");
    } catch {
      setError("Có lỗi khi lưu hồ sơ.");
    } finally {
      setIsSaving(false);
    }
  };

  const roleBadgeNames = Array.from(new Set(roleAssignments.map((item) => item.roleName)));

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="profile" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[var(--workspace-sidebar-width)]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Bảng điều khiển
                  </Link>
                  <span className="px-2">›</span>
                  <span className="font-semibold text-slate-700">Hồ sơ cá nhân</span>
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Hồ sơ cá nhân</h1>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/profile/change-password"
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đổi mật khẩu
                </Link>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setForm(initialForm);
                        setIsEditing(false);
                      }}
                      disabled={isSaving}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={isSaving || isLoading}
                      className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setIsEditing(true);
                    }}
                    disabled={isLoading}
                    className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    Chỉnh sửa
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-7">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Đang tải hồ sơ cá nhân...
              </div>
            ) : null}

            {!isLoading && error ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {!isLoading && notice ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            {!isLoading ? (
              <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="relative h-20 w-20">
                      {form.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.avatar}
                          alt="Ảnh đại diện"
                          className="h-20 w-20 rounded-2xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-blue-100 text-2xl font-semibold text-blue-700">
                          {toInitials(form.fullName || "Hồ sơ")}
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Chọn ảnh
                          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                        </label>
                        {form.avatar ? (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                avatar: "",
                              }))
                            }
                            className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Xóa ảnh
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    <h2 className="mt-4 text-xl font-semibold text-slate-900">{form.fullName || "Chưa có tên"}</h2>
                    <p className="mt-1 text-sm text-slate-500">{form.email || "Chưa có email"}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {roleBadgeNames.length > 0 ? (
                        roleBadgeNames.slice(0, 3).map((role) => (
                          <span
                            key={role}
                            className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                          >
                            {role}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          Chưa có vai trò
                        </span>
                      )}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-base font-semibold text-slate-900">Thông tin hệ thống</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Ngày tạo hồ sơ</span>
                        <span className="text-right font-medium text-slate-800">{formatDateTime(createdAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Cập nhật gần nhất</span>
                        <span className="text-right font-medium text-slate-800">{formatDateTime(updatedAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Lần đăng nhập cuối</span>
                        <span className="text-right font-medium text-slate-800">{formatDateTime(lastSignInAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Ngày vào làm</span>
                        <span className="text-right font-medium text-slate-800">{formatDateOnly(joinAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Ngày nghỉ việc</span>
                        <span className="text-right font-medium text-slate-800">{formatDateOnly(leaveAt)}</span>
                      </div>
                    </div>
                  </article>
                </aside>

                <section className="space-y-5">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Thông tin cá nhân</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Họ và tên</label>
                        <input
                          value={form.fullName}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              fullName: event.target.value,
                            }))
                          }
                          readOnly={!isEditing}
                          className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ${
                            isEditing
                              ? "border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                          placeholder="Nhập họ và tên"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Email</label>
                        <input
                          value={form.email}
                          readOnly
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Số điện thoại</label>
                        <input
                          value={form.phone}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              phone: event.target.value,
                            }))
                          }
                          readOnly={!isEditing}
                          className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ${
                            isEditing
                              ? "border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                          placeholder="Chưa có số điện thoại"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Ngày vào làm</label>
                        <input
                          value={formatDateOnly(joinAt)}
                          readOnly
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Ngày nghỉ việc</label>
                        <input
                          value={formatDateOnly(leaveAt)}
                          readOnly
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none"
                        />
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Phân quyền và đơn vị</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Phòng ban</p>
                        {departmentNames.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {departmentNames.map((department) => (
                              <span
                                key={department}
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                              >
                                {department}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Chưa có phòng ban được gán.</p>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-slate-700">Vai trò</p>
                        {roleAssignments.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {roleAssignments.map((item) => (
                              <span
                                key={`${item.roleName}-${item.departmentName}`}
                                className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                              >
                                {item.roleName} · {item.departmentName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Chưa có vai trò được gán.</p>
                        )}
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Bảo mật</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Chức năng đổi mật khẩu đã được tách sang trang riêng.
                    </p>
                    <div className="mt-4">
                      <Link
                        href="/profile/change-password"
                        className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Đi tới trang đổi mật khẩu
                      </Link>
                    </div>
                  </article>
                </section>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {cropSource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Cắt ảnh đại diện</h3>
              <p className="mt-1 text-sm text-slate-500">Di chuyển và phóng to để căn ảnh vào khung tròn.</p>
            </div>

            <div className="px-5 py-4">
              <div className="relative h-[320px] overflow-hidden rounded-xl bg-slate-900">
                <Cropper
                  image={cropSource}
                  crop={cropPosition}
                  zoom={cropZoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCropPosition}
                  onZoomChange={setCropZoom}
                  onCropComplete={(_, areaPixels) => setCropPixels(areaPixels)}
                />
              </div>

              <div className="mt-4">
                <label className="text-sm font-semibold text-slate-700">Phóng to</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={cropZoom}
                  onChange={(event) => setCropZoom(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setCropSource(null);
                  setCropPixels(null);
                }}
                disabled={isApplyingCrop}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleApplyAvatarCrop}
                disabled={isApplyingCrop}
                className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isApplyingCrop ? "Đang cắt..." : "Dùng ảnh này"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
