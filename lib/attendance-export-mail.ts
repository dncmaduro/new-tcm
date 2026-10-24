import "server-only";

import nodemailer from "nodemailer";
import { Buffer } from "node:buffer";

type AttendanceMailParams = {
  recipientEmail: string;
  recipientName: string;
  selectedMonth: Date;
  fileName: string;
  workbookBuffer: Buffer;
};

function getSmtpConfig() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "").trim();

  if (!user || !appPassword) {
    throw new Error(
      "Chưa cấu hình GMAIL_SMTP_USER và GMAIL_SMTP_APP_PASSWORD để gửi bảng công.",
    );
  }

  return { user, appPassword };
}

export function assertAttendanceMailConfigured() {
  getSmtpConfig();
}

function formatMonthLabel(selectedMonth: Date) {
  return `${String(selectedMonth.getMonth() + 1).padStart(2, "0")}/${selectedMonth.getFullYear()}`;
}

export async function sendAttendanceWorkbookEmail({
  recipientEmail,
  recipientName,
  selectedMonth,
  fileName,
  workbookBuffer,
}: AttendanceMailParams) {
  const { user, appPassword } = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass: appPassword,
    },
  });
  const monthLabel = formatMonthLabel(selectedMonth);
  const displayName = recipientName.trim() || "Anh/chị";

  await transporter.sendMail({
    from: user,
    to: recipientEmail,
    subject: `Bảng chấm công tháng ${monthLabel}`,
    text: [
      `Kính gửi ${displayName},`,
      "",
      `Kế toán gửi anh/chị bảng chấm công tháng ${monthLabel}.`,
      "Vui lòng kiểm tra file Excel đính kèm và phản hồi nếu có sai lệch.",
      "",
      "Trân trọng.",
    ].join("\n"),
    attachments: [
      {
        filename: fileName,
        content: workbookBuffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });
}
