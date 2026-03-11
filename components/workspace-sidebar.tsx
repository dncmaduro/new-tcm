import Link from "next/link";

type SidebarKey = "dashboard" | "goals" | "tasks" | "timesheet" | "reports" | "team" | "departments";

type WorkspaceSidebarProps = {
  active: SidebarKey;
};

const sidebarItems: Array<{ key: SidebarKey; label: string; href: string }> = [
  { key: "dashboard", label: "Bảng điều khiển", href: "/dashboard" },
  { key: "goals", label: "Mục tiêu", href: "/goals" },
  { key: "tasks", label: "Công việc", href: "/tasks" },
  { key: "timesheet", label: "Chấm công", href: "/timesheet" },
  { key: "reports", label: "Báo cáo", href: "#" },
  { key: "team", label: "Nhóm", href: "#" },
  { key: "departments", label: "Phòng ban", href: "/departments" },
];

function SidebarBadge() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500">
      <div className="h-3 w-3 rounded-sm border-2 border-white" />
    </div>
  );
}

export function WorkspaceSidebar({ active }: WorkspaceSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col overflow-y-auto bg-[#081633] px-5 pb-5 pt-6 text-slate-100 lg:flex">
      <div className="mb-8 flex items-center gap-3">
        <SidebarBadge />
        <div>
          <p className="text-2xl font-semibold tracking-[-0.02em]">TCM</p>
          <p className="text-sm text-slate-400">Nền tảng quản trị</p>
        </div>
      </div>

      <nav className="space-y-2">
        {sidebarItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-lg font-medium tracking-[-0.01em] transition ${
              item.key === active
                ? "bg-[#1e62d8] text-white"
                : "text-slate-300 hover:bg-[#0b1e43] hover:text-white"
            }`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-md border border-current/45 text-[11px]">
              {item.label[0]}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-lg text-slate-300 transition hover:bg-[#0b1e43] hover:text-white"
        >
          <span className="grid h-5 w-5 place-items-center rounded-md border border-current/45 text-[11px]">
            S
          </span>
          Cài đặt
        </button>
        <div className="rounded-xl bg-[#0d234f] p-3">
          <p className="text-base font-semibold">Alex Johnson</p>
          <p className="text-sm text-slate-400">Product Manager</p>
        </div>
      </div>
    </aside>
  );
}
