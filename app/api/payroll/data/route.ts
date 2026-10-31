import { NextResponse } from "next/server";

import { getAuthEmailsByUserIds } from "@/lib/auth-user-email";
import {
  authorizePayrollRequest,
  getPayrollErrorStatus,
  parsePayrollMonth,
} from "@/lib/payroll-api";
import {
  calculatePayroll,
  DEFAULT_DEMO_BASE_SALARY,
  type PayrollAdjustment,
  type PayrollAdjustmentKind,
  type PayrollCatalogItem,
} from "@/lib/payroll";
import { loadTimesheetExportContext } from "@/lib/timesheet-export";
import { REQUIRED_WORK_MINUTES } from "@/lib/work-time";

type PayrollDataPayload = {
  selectedMonth?: string;
  profileIds?: string[];
};

type PayrollProfileRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
};

type PayrollCompensationRow = {
  profile_id: string;
  monthly_base_salary: number | string | null;
};

type PayrollTypeRow = {
  id: string;
  name: string;
  kind: PayrollAdjustmentKind;
  is_fixed: boolean;
  is_active: boolean;
};

type PayrollTypeMonthRow = {
  type_id: string;
  month_number: number;
  is_active: boolean;
};

type PayrollAdjustmentRow = {
  id: string;
  profile_id: string;
  payroll_month: string;
  type_id: string | null;
  label: string;
  kind: PayrollAdjustmentKind;
  amount: number | string | null;
  note: string | null;
  source: "catalog" | "manual";
  is_applied: boolean;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapAdjustment(row: PayrollAdjustmentRow): PayrollAdjustment {
  return {
    id: row.id,
    profileId: row.profile_id,
    payrollMonth: row.payroll_month,
    typeId: row.type_id,
    label: row.label,
    kind: row.kind,
    amount: Math.max(0, Math.round(toNumber(row.amount))),
    note: row.note,
    source: row.source,
    isApplied: row.is_applied !== false,
  };
}

export async function POST(request: Request) {
  let payload: PayrollDataPayload;
  try {
    payload = (await request.json()) as PayrollDataPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const parsedMonth = parsePayrollMonth(payload.selectedMonth);
  const profileIds = [
    ...new Set(
      (Array.isArray(payload.profileIds) ? payload.profileIds : [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (!parsedMonth) {
    return NextResponse.json({ error: "Tháng bảng lương không hợp lệ." }, { status: 400 });
  }
  if (profileIds.length === 0) {
    return NextResponse.json({ error: "Thiếu danh sách nhân sự cần tính lương." }, { status: 400 });
  }

  try {
    const { serviceRoleClient } = await authorizePayrollRequest(request);
    const monthNumber = parsedMonth.date.getMonth() + 1;

    const [
      { data: profileRows, error: profilesError },
      { data: compensationRows, error: compensationError },
      { data: typeRows, error: typesError },
      { data: typeMonthRows, error: typeMonthsError },
      { data: adjustmentRows, error: adjustmentsError },
      { data: sendLogRows, error: sendLogsError },
    ] = await Promise.all([
      serviceRoleClient
        .from("profiles")
        .select("id,user_id,name,email")
        .in("id", profileIds)
        .order("name", { ascending: true }),
      serviceRoleClient
        .from("payroll_compensations")
        .select("profile_id,monthly_base_salary")
        .in("profile_id", profileIds),
      serviceRoleClient
        .from("payroll_adjustment_types")
        .select("id,name,kind,is_fixed,is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      serviceRoleClient
        .from("payroll_adjustment_type_months")
        .select("type_id,month_number,is_active")
        .eq("month_number", monthNumber)
        .eq("is_active", true),
      serviceRoleClient
        .from("payroll_adjustments")
        .select("id,profile_id,payroll_month,type_id,label,kind,amount,note,source,is_applied")
        .eq("payroll_month", parsedMonth.databaseToken)
        .in("profile_id", profileIds)
        .order("created_at", { ascending: true }),
      serviceRoleClient
        .from("payroll_send_logs")
        .select("profile_id,sent_at")
        .eq("payroll_month", parsedMonth.databaseToken)
        .in("profile_id", profileIds)
        .order("sent_at", { ascending: false }),
    ]);

    if (profilesError) throw profilesError;
    if (compensationError) throw compensationError;
    if (typesError) throw typesError;
    if (typeMonthsError) throw typeMonthsError;
    if (adjustmentsError) throw adjustmentsError;
    if (sendLogsError) throw sendLogsError;

    const profiles = (profileRows ?? []) as PayrollProfileRow[];
    const authEmailByUserId = await getAuthEmailsByUserIds(
      serviceRoleClient,
      profiles.map((profile) => profile.user_id),
    );
    const compensationByProfileId = new Map(
      ((compensationRows ?? []) as PayrollCompensationRow[]).map((row) => [
        String(row.profile_id),
        toNumber(row.monthly_base_salary),
      ]),
    );
    const types = (typeRows ?? []) as PayrollTypeRow[];
    const activeTypeIds = new Set(
      ((typeMonthRows ?? []) as PayrollTypeMonthRow[]).map((row) => String(row.type_id)),
    );
    const catalog: PayrollCatalogItem[] = types.map((type) => ({
      id: String(type.id),
      name: type.name,
      kind: type.kind,
      isFixed: type.is_fixed,
      isActive: type.is_active,
      activeThisMonth: !type.is_fixed || activeTypeIds.has(String(type.id)),
    }));
    const activeCatalog = catalog.filter((item) => item.activeThisMonth);
    const adjustmentsByProfileId = new Map<string, PayrollAdjustment[]>();

    ((adjustmentRows ?? []) as PayrollAdjustmentRow[]).forEach((row) => {
      const current = adjustmentsByProfileId.get(String(row.profile_id)) ?? [];
      current.push(mapAdjustment(row));
      adjustmentsByProfileId.set(String(row.profile_id), current);
    });

    const latestSentAtByProfileId = new Map<string, string>();
    (sendLogRows ?? []).forEach((row) => {
      const profileId = String(row.profile_id);
      if (!latestSentAtByProfileId.has(profileId)) {
        latestSentAtByProfileId.set(profileId, String(row.sent_at));
      }
    });

    const employees = await Promise.all(
      profiles.map(async (profile) => {
        const profileId = String(profile.id);
        const storedAdjustments = adjustmentsByProfileId.get(profileId) ?? [];
        const adjustments = [...storedAdjustments];

        activeCatalog.forEach((item) => {
          if (adjustments.some((adjustment) => adjustment.typeId === item.id)) {
            return;
          }

          adjustments.push({
            id: `active:${profileId}:${item.id}`,
            profileId,
            payrollMonth: parsedMonth.token,
            typeId: item.id,
            label: item.name,
            kind: item.kind,
            amount: 0,
            note: null,
            source: "catalog",
            isApplied: true,
          });
        });

        const exportContext = await loadTimesheetExportContext(profileId, parsedMonth.date, {
          supabaseClient: serviceRoleClient,
        });
        const workedMinutes = exportContext.adjustedCalendarDays.reduce(
          (total, day) => total + Math.max(0, Number(day.workingMinutes) || 0),
          0,
        );
        const requiredWorkDays = exportContext.adjustedAttendanceStats.requiredWorkDays;
        const standardWorkingMinutes = requiredWorkDays * REQUIRED_WORK_MINUTES;
        const baseSalary = compensationByProfileId.get(profileId) || DEFAULT_DEMO_BASE_SALARY;
        const calculation = calculatePayroll({
          baseSalary,
          workedMinutes,
          standardWorkingMinutes,
          workDays: exportContext.adjustedAttendanceStats.totalWorkDays,
          adjustments,
        });

        return {
          profile: {
            id: profileId,
            name: profile.name?.trim() || profile.email?.trim() || "Không rõ",
            email: authEmailByUserId.get(profile.user_id ?? "") || profile.email?.trim() || null,
          },
          baseSalary,
          isDemoBaseSalary: !compensationByProfileId.has(profileId),
          adjustments,
          calculation,
          lastSentAt: latestSentAtByProfileId.get(profileId) ?? null,
        };
      }),
    );

    return NextResponse.json(
      {
        selectedMonth: parsedMonth.token,
        formula:
          "Lương cơ bản × thời gian làm việc thực tế / thời gian chuẩn + thưởng - phạt",
        catalog,
        employees,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải dữ liệu bảng lương.";
    return NextResponse.json({ error: message }, { status: getPayrollErrorStatus(message) });
  }
}
