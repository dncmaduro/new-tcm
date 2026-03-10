"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type UpdatePasswordResponse = {
  error?: string;
  message?: string;
};

type RecoveryTokens = {
  accessToken: string;
  refreshToken: string;
};

function BrandMark() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <span className="h-8 w-3 rounded-full bg-blue-600" />
      <span className="h-8 w-3 rounded-full bg-blue-600" />
      <span className="h-8 w-3 rounded-full bg-blue-600" />
    </div>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-600" aria-hidden="true">
      <path
        d="M12 3a9 9 0 100 18 9 9 0 000-18zm1 12h-2v-2h2v2zm0-4h-2V7h2v4z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokens, setTokens] = useState<RecoveryTokens | null>(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);

    const accessToken =
      hashParams.get("access_token") ?? queryParams.get("access_token");
    const refreshToken =
      hashParams.get("refresh_token") ?? queryParams.get("refresh_token");

    if (accessToken && refreshToken) {
      setTokens({
        accessToken,
        refreshToken,
      });
      return;
    }

    setError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!tokens) {
      setError("Không tìm thấy token khôi phục. Vui lòng mở lại liên kết từ email.");
      return;
    }

    if (password.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Xác nhận mật khẩu không khớp.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        }),
      });

      const payload = (await response.json()) as UpdatePasswordResponse;

      if (!response.ok) {
        setError(payload.error ?? "Không cập nhật được mật khẩu. Vui lòng thử lại.");
        return;
      }

      setSuccess("Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.");
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError("Không thể kết nối tới dịch vụ xác thực. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3f5fa] px-4 py-10 font-sans text-slate-900">
      <div className="pointer-events-none absolute -left-32 top-8 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-4 h-72 w-72 rounded-full bg-sky-100/40 blur-3xl" />

      <main className="relative w-full max-w-[460px] animate-[panel-in_450ms_ease-out] text-center">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-5">
            <BrandMark />
          </div>
          <h1 className="text-[44px] leading-none font-semibold tracking-[-0.03em] text-slate-950 sm:text-[52px]">
            Đặt lại mật khẩu
          </h1>
          <p className="mt-3 max-w-md text-[15px] text-slate-500">
            Nhập mật khẩu mới để hoàn tất quá trình khôi phục tài khoản.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white/95 p-7 text-left shadow-[0_14px_36px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-[15px] font-semibold tracking-[-0.01em] text-slate-700"
              >
                Mật khẩu mới
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Nhập mật khẩu mới"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                required
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-[15px] font-semibold tracking-[-0.01em] text-slate-700"
              >
                Xác nhận mật khẩu mới
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                required
              />
              <p className="text-xs text-slate-400">Mật khẩu phải có ít nhất 8 ký tự.</p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !tokens}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold tracking-[-0.01em] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isSubmitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>
          </form>

          {error ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-[panel-in_220ms_ease-out]">
              <AlertIcon />
              <p>{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-[panel-in_220ms_ease-out]">
              {success}
            </div>
          ) : null}
        </section>

        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 text-lg font-medium tracking-[-0.01em] text-slate-700 transition hover:text-slate-900"
        >
          <span aria-hidden="true">←</span>
          Quay lại đăng nhập
        </Link>

        <p className="mt-24 text-sm text-slate-400">
          © 2024 Internal Systems Ltd. Cổng thông tin doanh nghiệp bảo mật.
        </p>
      </main>
    </div>
  );
}
