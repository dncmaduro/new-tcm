import Link from "next/link";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type AttendanceStatus = "ontime" | "late" | "missing";

type CalendarDay = {
  day: number;
  status?: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  absent?: boolean;
  selected?: boolean;
  workBar?: boolean;
};

type CorrectionRequest = {
  requestDate: string;
  correctionDate: string;
  type: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

const statCards = [
  { label: "Tổng ngày làm việc", value: "22", accent: "text-blue-600" },
  { label: "Ngày vắng mặt", value: "2", accent: "text-rose-500" },
  { label: "Thiếu giờ", value: "4.5h", accent: "text-amber-500" },
  { label: "Tổng tăng ca", value: "12h", accent: "text-emerald-500" },
];

const firstWeekdayIndex = 5;
const totalDays = 31;

const calendarDays: CalendarDay[] = [
  { day: 1, status: "ontime", checkIn: "08:55", checkOut: "18:05" },
  { day: 4, status: "ontime", checkIn: "09:02", checkOut: "18:10" },
  { day: 5, status: "late", checkIn: "09:35", checkOut: "18:00", selected: true },
  { day: 6, status: "ontime", checkIn: "08:45", checkOut: "18:15" },
  { day: 7, status: "missing", absent: true },
  { day: 8, status: "ontime", checkIn: "08:58", checkOut: "18:30" },
  { day: 11, workBar: true },
  { day: 12, workBar: true },
  { day: 13, workBar: true },
  { day: 14, workBar: true },
  { day: 15, workBar: true },
];

const correctionRequests: CorrectionRequest[] = [
  {
    requestDate: "06/03/2024",
    correctionDate: "05/03/2024",
    type: "Check-in trễ",
    reason: "Kẹt xe do mưa lớn, đến văn phòng muộn hơn dự kiến.",
    status: "pending",
  },
  {
    requestDate: "02/03/2024",
    correctionDate: "01/03/2024",
    type: "Thiếu lượt chấm",
    reason: "Quên quét thẻ khi vào cổng, cần cập nhật lại bản ghi.",
    status: "approved",
  },
  {
    requestDate: "28/02/2024",
    correctionDate: "27/02/2024",
    type: "Khai báo tăng ca",
    reason: "Hỗ trợ release gấp nên ở lại xử lý đến tối.",
    status: "rejected",
  },
];

const weekDayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getDayData(day: number) {
  return calendarDays.find((item) => item.day === day);
}

function StatusDot({ status }: { status: AttendanceStatus }) {
  if (status === "missing") {
    return <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />;
  }
  if (status === "late") {
    return <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />;
}

function RequestStatus({ status }: { status: CorrectionRequest["status"] }) {
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

export default function TimesheetPage() {
  const monthCells = Array.from({ length: 35 }, (_, index) => {
    const day = index - firstWeekdayIndex + 1;
    if (day < 1 || day > totalDays) {
      return null;
    }
    return { day, meta: getDayData(day) };
  });

  return (
    <div className="min-h-screen bg-[#f3f5fa] text-slate-900">
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar active="timesheet" />

        <div className="flex min-h-screen w-full flex-1 flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f3f5fa]/95 px-4 py-4 backdrop-blur lg:px-7">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">Chấm công</h1>
                <div className="flex items-center gap-2">
                  <Link
                    href="/timesheet/time-request/new"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Tạo yêu cầu
                  </Link>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                  ‹ Tháng 03/2024 ›
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Xuất CSV
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-7">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {statCards.map((item) => (
                <article key={item.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-xs font-bold tracking-[0.08em] text-slate-400 uppercase">{item.label}</p>
                  <p className={`mt-2 text-4xl font-semibold tracking-[-0.02em] ${item.accent}`}>{item.value}</p>
                </article>
              ))}
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <h2 className="text-2xl font-semibold text-slate-900">Nhật ký chấm công theo tháng</h2>
                <div className="flex items-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Đúng giờ
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Trễ/Sớm
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    Thiếu công
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
                {weekDayLabels.map((label) => (
                  <div
                    key={label}
                    className="h-12 border-l border-slate-100 text-center text-xs font-bold tracking-[0.08em] text-slate-400 first:border-l-0 leading-[48px] uppercase"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {monthCells.map((cell, index) => {
                  if (!cell) {
                    return <div key={`empty-${index}`} className="h-28 border-l border-t border-slate-100 first:border-l-0" />;
                  }

                  const meta = cell.meta;
                  return (
                    <div
                      key={`day-${cell.day}`}
                      className={`relative h-28 border-l border-t border-slate-100 px-2.5 py-2 first:border-l-0 ${
                        meta?.selected ? "z-[1] border border-blue-500 bg-blue-50/20" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-base font-semibold text-slate-800">{cell.day}</span>
                        {meta?.status ? <StatusDot status={meta.status} /> : null}
                      </div>

                      {meta?.checkIn || meta?.checkOut ? (
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          <p className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center text-[11px] font-semibold text-slate-700">
                            {meta?.checkIn ?? "--:--"}
                          </p>
                          <p className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center text-[11px] font-semibold text-slate-700">
                            {meta?.checkOut ?? "--:--"}
                          </p>
                        </div>
                      ) : null}

                      {meta?.status === "late" ? (
                        <span className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Đi trễ
                        </span>
                      ) : null}

                      {meta?.absent ? (
                        <span className="mt-3 inline-flex rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          Vắng mặt
                        </span>
                      ) : null}

                      {meta?.workBar ? <div className="absolute bottom-3 left-2.5 right-2.5 h-1 rounded-full bg-emerald-500" /> : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <h2 className="text-2xl font-semibold text-slate-900">Yêu cầu điều chỉnh công</h2>
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button type="button" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Tất cả
                  </button>
                  <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">
                    Chờ duyệt
                  </button>
                  <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">
                    Đã duyệt
                  </button>
                  <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">
                    Từ chối
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead>
                    <tr className="text-xs tracking-[0.08em] text-slate-400 uppercase">
                      <th className="px-5 py-3 font-semibold">Ngày gửi</th>
                      <th className="px-5 py-3 font-semibold">Ngày cần sửa</th>
                      <th className="px-5 py-3 font-semibold">Loại điều chỉnh</th>
                      <th className="px-5 py-3 font-semibold">Lý do</th>
                      <th className="px-5 py-3 font-semibold">Trạng thái</th>
                      <th className="px-5 py-3 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correctionRequests.map((item) => (
                      <tr key={`${item.requestDate}-${item.type}`} className="border-t border-slate-100">
                        <td className="px-5 py-4 text-sm font-medium text-slate-700">{item.requestDate}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{item.correctionDate}</td>
                        <td className="px-5 py-4">
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-500">
                          <p className="max-w-[280px] truncate">{item.reason}</p>
                        </td>
                        <td className="px-5 py-4">
                          <RequestStatus status={item.status} />
                        </td>
                        <td className="px-5 py-4 text-right text-lg text-slate-400">◉</td>
                      </tr>
                    ))}
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
