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
  normalizeMoney,
  type PayrollAdjustment,
  type PayrollAdjustmentKind,
} from "@/lib/payroll";
import { assertPayrollMailConfigured, sendPayrollStatementEmail } from "@/lib/payroll-mail";
import { loadTimesheetExportContext } from "@/lib/timesheet-export";
import { REQUIRED_WORK_MINUTES } from "@/lib/work-time";

type PayrollSendPayload = {
  selectedMonth?: string;
  profileId?: string;
};

type PayrollProfileRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
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

function mapAdjustment(row: PayrollAdjustmentRow): PayrollAdjustment {
  return {
    id: row.id,
    profileId: row.profile_id,
    payrollMonth: row.payroll_month,
    typeId: row.type_id,
    label: row.label,
    kind: row.kind,
    amount: normalizeMoney(row.amount),
    note: row.note,
    source: row.source,
    isApplied: row.is_applied !== false,
  };
}

export async function POST(request: Request) {
  let payload: PayrollSendPayload;
  try {
    payload = (await request.json()) as PayrollSendPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const parsedMonth = parsePayrollMonth(payload.selectedMonth);
  const profileId = payload.profileId?.trim();
  if (!parsedMonth) {
    return NextResponse.json({ error: "Tháng gửi bảng lương không hợp lệ." }, { status: 400 });
  }
  if (!profileId) {
    return NextResponse.json({ error: "Thiếu nhân sự cần gửi bảng lương." }, { status: 400 });
  }

  try {
    assertPayrollMailConfigured();
    const { user, serviceRoleClient } = await authorizePayrollRequest(request);
    const [
      { data: profileData, error: profileError },
      { data: compensationData, error: compensationError },
      { data: adjustmentData, error: adjustmentsError },
    ] = await Promise.all([
      serviceRoleClient
        .from("profiles")
        .select("id,user_id,name,email")
        .eq("id", profileId)
        .maybeSingle(),
      serviceRoleClient
        .from("payroll_compensations")
        .select("monthly_base_salary")
        .eq("profile_id", profileId)
        .maybeSingle(),
      serviceRoleClient
        .from("payroll_adjustments")
        .select("id,profile_id,payroll_month,type_id,label,kind,amount,note,source,is_applied")
        .eq("profile_id", profileId)
        .eq("payroll_month", parsedMonth.databaseToken)
        .order("created_at", { ascending: true }),
    ]);
    if (profileError) throw profileError;
    if (compensationError) throw compensationError;
    if (adjustmentsError) throw adjustmentsError;

    const profile = profileData as PayrollProfileRow | null;
    if (!profile) {
      return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });
    }

    const authEmailByUserId = await getAuthEmailsByUserIds(serviceRoleClient, [profile.user_id]);
    const recipientEmail = authEmailByUserId.get(profile.user_id ?? "") || profile.email?.trim() || "";
    if (!recipientEmail) {
      return NextResponse.json({ error: "Nhân sự chưa có email để nhận bảng lương." }, { status: 400 });
    }

    const adjustments = ((adjustmentData ?? []) as PayrollAdjustmentRow[]).map(mapAdjustment);
    const exportContext = await loadTimesheetExportContext(profileId, parsedMonth.date, {
      supabaseClient: serviceRoleClient,
    });
    const workedMinutes = exportContext.adjustedCalendarDays.reduce(
      (total, day) => total + Math.max(0, Number(day.workingMinutes) || 0),
      0,
    );
    const standardWorkingMinutes =
      exportContext.adjustedAttendanceStats.requiredWorkDays * REQUIRED_WORK_MINUTES;
    const configuredBaseSalary = normalizeMoney(
      (compensationData as { monthly_base_salary?: number | string | null } | null)
        ?.monthly_base_salary,
    );
    const baseSalary = configuredBaseSalary || DEFAULT_DEMO_BASE_SALARY;
    const calculation = calculatePayroll({
      baseSalary,
      workedMinutes,
      standardWorkingMinutes,
      workDays: exportContext.adjustedAttendanceStats.totalWorkDays,
      adjustments,
    });

    await sendPayrollStatementEmail({
      recipientEmail,
      recipientName: profile.name?.trim() || profile.email?.trim() || "Anh/chị",
      selectedMonth: parsedMonth.token,
      calculation,
      adjustments,
    });

    let senderProfileId: string | null = null;
    const { data: senderProfile } = await serviceRoleClient
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (senderProfile?.id) {
      senderProfileId = String(senderProfile.id);
    }

    const { error: logError } = await serviceRoleClient.from("payroll_send_logs").insert({
      payroll_month: parsedMonth.databaseToken,
      profile_id: profileId,
      recipient_email: recipientEmail,
      total_salary: calculation.totalSalary,
      sent_by: senderProfileId,
    });
    if (logError) throw logError;

    return NextResponse.json(
      {
        success: true,
        sentAt: new Date().toISOString(),
        recipientEmail,
        totalSalary: calculation.totalSalary,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể gửi bảng lương.";
    return NextResponse.json({ error: message }, { status: getPayrollErrorStatus(message) });
  }
}
