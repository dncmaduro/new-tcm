"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type ForgotPasswordResponse = {
  error?: string;
  message?: string;
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });

      const payload = (await response.json()) as ForgotPasswordResponse;

      if (!response.ok) {
        setError(payload.error ?? "Email không hợp lệ. Vui lòng kiểm tra lại.");
        return;
      }

      setSuccess("Yêu cầu đã được gửi. Vui lòng kiểm tra email để nhận liên kết đặt lại mật khẩu.");
    } catch {
      setError("Không thể gửi yêu cầu lúc này. Vui lòng thử lại.");
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
            Quên mật khẩu
          </h1>
          <p className="mt-3 max-w-md text-[15px] text-slate-500">
            Nhập email tài khoản, chúng tôi sẽ gửi liên kết để bạn đặt lại mật khẩu.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white/95 p-7 text-left shadow-[0_14px_36px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-[15px] font-semibold tracking-[-0.01em] text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tenban@congty.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold tracking-[-0.01em] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isSubmitting ? "Đang gửi..." : "Gửi liên kết đặt lại"}
            </button>
          </form>

          {isSubmitting ? (
            <div className="mt-4 space-y-3 animate-[panel-in_220ms_ease-out]">
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" />
                  <path
                    d="M21 12a9 9 0 00-9-9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Đang gửi yêu cầu...
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 rounded-full bg-blue-600 animate-[loading-bar_1.2s_ease-in-out_infinite]" />
              </div>
            </div>
          ) : null}

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
          © 2024 TCM. Cổng thông tin doanh nghiệp bảo mật.
        </p>
      </main>
    </div>
  );
}
