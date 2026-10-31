export type PayrollAdjustmentKind = "bonus" | "penalty";

export type PayrollAdjustmentSource = "catalog" | "manual";

export type PayrollAdjustment = {
  id: string;
  profileId: string;
  payrollMonth: string;
  typeId: string | null;
  label: string;
  kind: PayrollAdjustmentKind;
  amount: number;
  note: string | null;
  source: PayrollAdjustmentSource;
  isApplied: boolean;
};

export type PayrollCatalogItem = {
  id: string;
  name: string;
  kind: PayrollAdjustmentKind;
  isFixed: boolean;
  isActive: boolean;
  activeThisMonth: boolean;
};

export type PayrollCalculation = {
  baseSalary: number;
  workedMinutes: number;
  standardWorkingMinutes: number;
  workDays: number;
  attendanceRatio: number;
  proratedBaseSalary: number;
  totalBonus: number;
  totalPenalty: number;
  totalSalary: number;
};

export const DEFAULT_DEMO_BASE_SALARY = 30_000_000;
export const STANDARD_WORKDAY_MINUTES = 8 * 60;

export function normalizeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  return 0;
}

export function calculatePayroll({
  baseSalary,
  workedMinutes,
  standardWorkingMinutes,
  workDays,
  adjustments,
}: {
  baseSalary: number;
  workedMinutes: number;
  standardWorkingMinutes: number;
  workDays: number;
  adjustments: Array<Pick<PayrollAdjustment, "kind" | "amount" | "isApplied">>;
}): PayrollCalculation {
  const safeBaseSalary = normalizeMoney(baseSalary);
  const safeWorkedMinutes = Math.max(0, Math.round(Number(workedMinutes) || 0));
  const safeStandardWorkingMinutes = Math.max(
    0,
    Math.round(Number(standardWorkingMinutes) || 0),
  );
  const attendanceRatio =
    safeStandardWorkingMinutes > 0
      ? Math.min(1, safeWorkedMinutes / safeStandardWorkingMinutes)
      : 0;
  const proratedBaseSalary = Math.round(safeBaseSalary * attendanceRatio);
  const totalBonus = adjustments.reduce(
    (sum, item) =>
      item.isApplied && item.kind === "bonus" ? sum + normalizeMoney(item.amount) : sum,
    0,
  );
  const totalPenalty = adjustments.reduce(
    (sum, item) =>
      item.isApplied && item.kind === "penalty" ? sum + normalizeMoney(item.amount) : sum,
    0,
  );

  return {
    baseSalary: safeBaseSalary,
    workedMinutes: safeWorkedMinutes,
    standardWorkingMinutes: safeStandardWorkingMinutes,
    workDays: Math.max(0, Math.round(Number(workDays) || 0)),
    attendanceRatio,
    proratedBaseSalary,
    totalBonus,
    totalPenalty,
    totalSalary: Math.max(0, proratedBaseSalary + totalBonus - totalPenalty),
  };
}

export function formatPayrollMonth(value: string) {
  const [year, month] = value.split("-");
  return month && year ? `${month}/${year}` : value;
}

export function formatPayrollMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(normalizeMoney(value));
}

export function formatPayrollDuration(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
