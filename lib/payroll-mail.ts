import "server-only";

import nodemailer from "nodemailer";
import type { PayrollAdjustment, PayrollCalculation } from "@/lib/payroll";
import { formatPayrollDuration, formatPayrollMoney, formatPayrollMonth } from "@/lib/payroll";

function getSmtpConfig() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "").trim();

  if (!user || !appPassword) {
    throw new Error(
      "Chưa cấu hình GMAIL_SMTP_USER và GMAIL_SMTP_APP_PASSWORD để gửi bảng lương.",
    );
  }

  return { user, appPassword };
}

export function assertPayrollMailConfigured() {
  getSmtpConfig();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendPayrollStatementEmail({
  recipientEmail,
  recipientName,
  selectedMonth,
  calculation,
  adjustments,
}: {
  recipientEmail: string;
  recipientName: string;
  selectedMonth: string;
  calculation: PayrollCalculation;
  adjustments: PayrollAdjustment[];
}) {
  const { user, appPassword } = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });
  const monthLabel = formatPayrollMonth(selectedMonth);
  const displayName = recipientName.trim() || "Anh/chị";
  const appliedAdjustments = adjustments.filter((item) => item.isApplied && item.amount > 0);
  const adjustmentLines = appliedAdjustments.length
    ? appliedAdjustments
        .map(
          (item) =>
            `- ${item.kind === "bonus" ? "Thưởng" : "Phạt"}: ${item.label} — ${formatPayrollMoney(item.amount)}`,
        )
        .join("\n")
    : "- Không có khoản thưởng/phạt phát sinh";

  const text = [
    `Kính gửi ${displayName},`,
    "",
    `Kế toán gửi anh/chị bảng lương demo tháng ${monthLabel}.`,
    "",
    `- Thời gian làm việc: ${formatPayrollDuration(calculation.workedMinutes)} / ${formatPayrollDuration(calculation.standardWorkingMinutes)}`,
    `- Lương cơ bản: ${formatPayrollMoney(calculation.baseSalary)}`,
    `- Lương theo thời gian: ${formatPayrollMoney(calculation.proratedBaseSalary)}`,
    adjustmentLines,
    `- Tổng lương tạm tính: ${formatPayrollMoney(calculation.totalSalary)}`,
    "",
    "Công thức demo: lương cơ bản × thời gian làm việc thực tế / thời gian chuẩn + thưởng - phạt.",
    "Vui lòng kiểm tra và phản hồi nếu có sai lệch.",
    "",
    "Trân trọng.",
  ].join("\n");

  const adjustmentRows = appliedAdjustments.length
    ? appliedAdjustments
        .map(
          (item) => `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(item.label)}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${item.kind === "bonus" ? "Thưởng" : "Phạt"}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(formatPayrollMoney(item.amount))}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="padding:8px 0;color:#64748b">Không có khoản thưởng/phạt phát sinh</td></tr>`;

  const html = `<!doctype html>
    <html lang="vi"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
      <p>Kính gửi ${escapeHtml(displayName)},</p>
      <p>Kế toán gửi anh/chị bảng lương demo tháng <strong>${escapeHtml(monthLabel)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        <tr><td style="padding:8px 0">Thời gian làm việc</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatPayrollDuration(calculation.workedMinutes))} / ${escapeHtml(formatPayrollDuration(calculation.standardWorkingMinutes))}</td></tr>
        <tr><td style="padding:8px 0">Lương cơ bản</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatPayrollMoney(calculation.baseSalary))}</td></tr>
        <tr><td style="padding:8px 0">Lương theo thời gian</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatPayrollMoney(calculation.proratedBaseSalary))}</td></tr>
      </table>
      <h3 style="margin-bottom:4px">Thưởng/phạt</h3>
      <table style="border-collapse:collapse;width:100%;max-width:640px"><tbody>${adjustmentRows}</tbody></table>
      <p style="font-size:18px"><strong>Tổng lương tạm tính: ${escapeHtml(formatPayrollMoney(calculation.totalSalary))}</strong></p>
      <p style="color:#475569">Công thức demo: lương cơ bản × thời gian làm việc thực tế / thời gian chuẩn + thưởng - phạt.</p>
      <p>Vui lòng kiểm tra và phản hồi nếu có sai lệch.</p>
      <p>Trân trọng.</p>
    </body></html>`;

  await transporter.sendMail({
    from: user,
    to: recipientEmail,
    subject: `Bảng lương tháng ${monthLabel}`,
    text,
    html,
  });
}
