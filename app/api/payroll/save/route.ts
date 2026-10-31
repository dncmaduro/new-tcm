import { NextResponse } from "next/server";

import {
  authorizePayrollRequest,
  getPayrollErrorStatus,
  parsePayrollMonth,
} from "@/lib/payroll-api";
import { normalizeMoney, type PayrollAdjustmentKind } from "@/lib/payroll";

type PayrollSaveAdjustment = {
  typeId?: string | null;
  label?: string;
  kind?: PayrollAdjustmentKind;
  amount?: number | string;
  note?: string | null;
  isApplied?: boolean;
};

type PayrollSavePayload = {
  selectedMonth?: string;
  profileId?: string;
  baseSalary?: number | string;
  adjustments?: PayrollSaveAdjustment[];
};

function isAdjustmentKind(value: unknown): value is PayrollAdjustmentKind {
  return value === "bonus" || value === "penalty";
}

export async function POST(request: Request) {
  let payload: PayrollSavePayload;
  try {
    payload = (await request.json()) as PayrollSavePayload;
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const parsedMonth = parsePayrollMonth(payload.selectedMonth);
  const profileId = payload.profileId?.trim();
  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [];

  if (!parsedMonth) {
    return NextResponse.json({ error: "Tháng bảng lương không hợp lệ." }, { status: 400 });
  }
  if (!profileId) {
    return NextResponse.json({ error: "Thiếu nhân sự cần lưu bảng lương." }, { status: 400 });
  }

  try {
    const { serviceRoleClient } = await authorizePayrollRequest(request);
    const { data: profile, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });
    }

    const requestedTypeIds = [
      ...new Set(
        adjustments
          .map((item) => item.typeId?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const { data: typeRows, error: typesError } =
      requestedTypeIds.length > 0
        ? await serviceRoleClient
            .from("payroll_adjustment_types")
            .select("id,name,kind,is_active")
            .in("id", requestedTypeIds)
        : { data: [], error: null };
    if (typesError) throw typesError;

    const typeById = new Map(
      (typeRows ?? []).map((row) => [String(row.id), row as { name: string; kind: PayrollAdjustmentKind; is_active: boolean }]),
    );
    const rowsToInsert = [] as Array<{
      payroll_month: string;
      profile_id: string;
      type_id: string | null;
      label: string;
      kind: PayrollAdjustmentKind;
      amount: number;
      note: string | null;
      source: "catalog" | "manual";
      is_applied: boolean;
    }>;

    for (const item of adjustments) {
      const typeId = item.typeId?.trim() || null;
      const catalogType = typeId ? typeById.get(typeId) : null;
      if (typeId && (!catalogType || catalogType.is_active === false)) {
        return NextResponse.json({ error: "Khoản thưởng/phạt định sẵn không hợp lệ." }, { status: 400 });
      }

      const label = (catalogType?.name || item.label || "").trim();
      const kind = catalogType?.kind || item.kind;
      if (!label || !isAdjustmentKind(kind)) {
        return NextResponse.json({ error: "Mỗi khoản thưởng/phạt cần có tên và loại hợp lệ." }, { status: 400 });
      }

      rowsToInsert.push({
        payroll_month: parsedMonth.databaseToken,
        profile_id: profileId,
        type_id: typeId,
        label,
        kind,
        amount: normalizeMoney(item.amount),
        note: item.note?.trim() || null,
        source: typeId ? "catalog" : "manual",
        is_applied: item.isApplied !== false,
      });
    }

    const { error: compensationError } = await serviceRoleClient
      .from("payroll_compensations")
      .upsert(
        {
          profile_id: profileId,
          monthly_base_salary: normalizeMoney(payload.baseSalary),
          currency: "VND",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      );
    if (compensationError) throw compensationError;

    const { error: deleteError } = await serviceRoleClient
      .from("payroll_adjustments")
      .delete()
      .eq("profile_id", profileId)
      .eq("payroll_month", parsedMonth.databaseToken);
    if (deleteError) throw deleteError;

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await serviceRoleClient
        .from("payroll_adjustments")
        .insert(rowsToInsert);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu bảng lương.";
    return NextResponse.json({ error: message }, { status: getPayrollErrorStatus(message) });
  }
}
