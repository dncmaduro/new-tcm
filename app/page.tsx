"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type LoginResponse = {
  error?: string;
  user?: {
    email?: string;
  };
};

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" aria-hidden="true">
      <path
        d="M12 2.5L5 5.5v5.7c0 4.3 2.7 8.2 7 9.8 4.3-1.6 7-5.5 7-9.8V5.5l-7-3z"
        fill="currentColor"
        fillOpacity="0.95"
      />
      <circle cx="12" cy="11" r="2.1" fill="#2563eb" />
    </svg>
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

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(
          payload.error ?? "Email hoặc mật khẩu không đúng. Vui lòng thử lại.",
        );
        return;
      }

      router.push("/dashboard");
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

      <main className="relative w-full max-w-[420px] animate-[panel-in_450ms_ease-out]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-[0_10px_22px_-12px_rgba(37,99,235,0.9)]">
            <ShieldIcon />
          </div>
          <h1 className="text-4xl leading-none font-semibold tracking-[-0.03em] text-slate-950 sm:text-[46px]">
            Chào mừng trở lại
          </h1>
          <p className="mt-2 text-[15px] text-slate-500">
            Nhập thông tin đăng nhập để truy cập hệ thống
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-[0_14px_36px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-[panel-in_220ms_ease-out]">
                <AlertIcon />
                <p>{error}</p>
              </div>
            ) : null}

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
                autoComplete="username"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-[15px] font-semibold tracking-[-0.01em] text-slate-700"
                >
                  Mật khẩu
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="********"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                minLength={8}
                required
              />
              <p className="text-xs text-slate-400">Mật khẩu phải có ít nhất 8 ký tự.</p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold tracking-[-0.015em] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isSubmitting ? (
                <>
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
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng nhập"
              )}
            </button>
          </form>
        </section>

        <footer className="mt-9 text-center">
          <p className="text-sm text-slate-400">© 2024 TCM.</p>
          <div className="mt-2 flex items-center justify-center gap-5 text-sm text-slate-400">
            <a href="#" className="transition hover:text-slate-600">
              Chính sách bảo mật
            </a>
            <a href="#" className="transition hover:text-slate-600">
              Liên hệ hỗ trợ
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
