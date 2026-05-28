import ExcelJS from "exceljs";

import type { CalendarDay, TimesheetExportContext } from "@/components/timesheet/timesheet-overview";
import { formatDateDdMmYyyy } from "@/lib/date-format";
import { REQUIRED_WORK_MINUTES } from "@/lib/work-time";

export type AttendanceExportProfile = {
  id: string;
  name: string;
  email: string | null;
  roleLabel: string;
  departmentLabel: string;
};

type ExportDayRow = {
  values: Array<string | number>;
  isSunday: boolean;
  workingMinutes: number;
  lateMinutes: number;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
};

type ProfileSectionLayout = {
  infoStartRow: number;
  infoEndRow: number;
  tableHeaderRow: number;
  tableFirstDataRow: number;
  tableLastDataRow: number;
  penaltyCellAddress: string;
};

const BASE_FONT = { name: "Times New Roman", size: 11 };
const BOLD_FONT = { name: "Times New Roman", size: 11, bold: true };
const TITLE_FONT = { name: "Times New Roman", size: 18, bold: true };
const INFO_ROW_FONT = { name: "Times New Roman", size: 15, bold: true };
const BORDER_COLOR = "FF000000";
const HIGHLIGHT_YELLOW = "FFFFFF00";
const SUNDAY_BLUE = "FF1FC0EA";

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function translateRoleLabel(roleLabel: string) {
  const normalized = normalizeText(roleLabel);
  if (normalized.includes("giam doc") || normalized.includes("director")) {
    return "Giám đốc";
  }
  if (
    normalized.includes("leader") ||
    normalized.includes("truong nhom") ||
    normalized.includes("manager")
  ) {
    return "Leader";
  }
  if (normalized.includes("member") || normalized.includes("thanh vien")) {
    return "Nhân viên";
  }
  return roleLabel;
}

function toTitleCaseVi(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatHoursDecimal(minutes: number) {
  return Number((Math.max(0, minutes) / 60).toFixed(2));
}

function formatWorkdayCredit(day: CalendarDay) {
  if (day.isHoliday) {
    return 0;
  }

  const workingMinutes =
    typeof day.workingMinutes === "number" && Number.isFinite(day.workingMinutes)
      ? Math.max(0, day.workingMinutes)
      : 0;

  if (workingMinutes <= 0) {
    return 0;
  }

  return Number(Math.min(1, workingMinutes / REQUIRED_WORK_MINUTES).toFixed(2));
}

function formatMonthTitle(value: Date) {
  return `BẢNG CHI TIẾT CHẤM CÔNG THÁNG ${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
}

function formatPenaltySheetTitle(value: Date) {
  return `TỔNG HỢP TIỀN PHẠT THÁNG ${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
}

function buildDayRows(context: TimesheetExportContext): ExportDayRow[] {
  const totalDaysInMonth = new Date(
    context.selectedMonth.getFullYear(),
    context.selectedMonth.getMonth() + 1,
    0,
  ).getDate();
  const dayByIso = context.adjustedCalendarDays.reduce<Map<string, CalendarDay>>((acc, day) => {
    if (day.dateIso) {
      acc.set(day.dateIso, day);
    }
    return acc;
  }, new Map());

  return Array.from({ length: totalDaysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const dateValue = new Date(
      context.selectedMonth.getFullYear(),
      context.selectedMonth.getMonth(),
      dayNumber,
    );
    const dateIso = `${context.selectedMonth.getFullYear()}-${String(
      context.selectedMonth.getMonth() + 1,
    ).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const meta = dayByIso.get(dateIso);
    const isSunday = dateValue.getDay() === 0;
    const lateMinutes =
      typeof meta?.lateMinutes === "number" && Number.isFinite(meta.lateMinutes)
        ? Math.max(0, meta.lateMinutes)
        : 0;
    const earlyLeaveMinutes =
      typeof meta?.earlyLeaveMinutes === "number" && Number.isFinite(meta.earlyLeaveMinutes)
        ? Math.max(0, meta.earlyLeaveMinutes)
        : 0;
    const workingMinutes =
      typeof meta?.workingMinutes === "number" && Number.isFinite(meta.workingMinutes)
        ? Math.max(0, meta.workingMinutes)
        : 0;
    const overtimeMinutes =
      typeof meta?.overtimeMinutes === "number" && Number.isFinite(meta.overtimeMinutes)
        ? Math.max(0, meta.overtimeMinutes)
        : 0;
    const hasCheckIn = Boolean(meta?.checkIn && meta.checkIn !== "--:--");
    const hasCheckOut = Boolean(meta?.checkOut && meta.checkOut !== "--:--");

    return {
      isSunday,
      workingMinutes,
      lateMinutes,
      hasCheckIn,
      hasCheckOut,
      values: [
        formatDateDdMmYyyy(dateIso, "", ""),
        toTitleCaseVi(
          new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(
            new Date(`${dateIso}T00:00:00`),
          ),
        ),
        meta?.checkIn && meta.checkIn !== "--:--" ? meta.checkIn : "",
        meta?.checkOut && meta.checkOut !== "--:--" ? meta.checkOut : "",
        lateMinutes > 0 ? formatHoursDecimal(lateMinutes) : "",
        earlyLeaveMinutes > 0 ? formatHoursDecimal(earlyLeaveMinutes) : "",
        workingMinutes > 0 ? formatHoursDecimal(workingMinutes) : "",
        formatWorkdayCredit(meta ?? { day: dayNumber }),
        overtimeMinutes > 0 ? formatHoursDecimal(overtimeMinutes) : "",
        "",
        "",
        "",
      ],
    };
  });
}

function setCellFill(cell: ExcelJS.Cell, color: string) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };
}

function setCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  };
}

function clearCellBorder(cell: ExcelJS.Cell) {
  cell.border = {};
}

function setRowHeight(worksheet: ExcelJS.Worksheet, rowNumber: number, height: number) {
  worksheet.getRow(rowNumber).height = height;
}

function setBaseSheetStyle(worksheet: ExcelJS.Worksheet) {
  worksheet.eachRow((row) => {
    row.height = row.height ?? 20;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        ...BASE_FONT,
        ...(cell.font ?? {}),
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        ...(cell.alignment ?? {}),
      };
    });
  });
}

function mergeCells(worksheet: ExcelJS.Worksheet, range: string) {
  if (!worksheet.getCell(range.split(":")[0]).isMerged) {
    worksheet.mergeCells(range);
  }
}

function writeSummaryLabel(worksheet: ExcelJS.Worksheet, range: string, value: string) {
  mergeCells(worksheet, range);
  const cell = worksheet.getCell(range.split(":")[0]);
  cell.value = value;
  cell.font = BOLD_FONT;
  cell.alignment = { horizontal: "left", vertical: "middle" };
}

function writeSummaryValue(
  worksheet: ExcelJS.Worksheet,
  range: string,
  value: string | number,
  font: Partial<ExcelJS.Font> = BASE_FONT,
) {
  mergeCells(worksheet, range);
  const cell = worksheet.getCell(range.split(":")[0]);
  cell.value = value;
  cell.font = font;
  cell.alignment = {
    horizontal: "left",
    vertical: "middle",
  };
}

function applyOuterBorderOnly(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startColumn: number,
  endColumn: number,
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      clearCellBorder(worksheet.getRow(row).getCell(column));
    }
  }

  for (let column = startColumn; column <= endColumn; column += 1) {
    const topCell = worksheet.getRow(startRow).getCell(column);
    topCell.border = {
      ...topCell.border,
      top: { style: "thin", color: { argb: BORDER_COLOR } },
    };

    const bottomCell = worksheet.getRow(endRow).getCell(column);
    bottomCell.border = {
      ...bottomCell.border,
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  }

  for (let row = startRow; row <= endRow; row += 1) {
    const leftCell = worksheet.getRow(row).getCell(startColumn);
    leftCell.border = {
      ...leftCell.border,
      left: { style: "thin", color: { argb: BORDER_COLOR } },
    };

    const rightCell = worksheet.getRow(row).getCell(endColumn);
    rightCell.border = {
      ...rightCell.border,
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  }
}

function applyDailyTableBorders(
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  firstDataRow: number,
  lastDataRow: number,
) {
  for (let column = 1; column <= 12; column += 1) {
    setCellBorder(worksheet.getRow(headerRow).getCell(column));
  }

  for (let row = firstDataRow; row <= lastDataRow; row += 1) {
    for (let column = 1; column <= 9; column += 1) {
      setCellBorder(worksheet.getRow(row).getCell(column));
    }
  }

  for (let column = 10; column <= 12; column += 1) {
    setCellBorder(worksheet.getRow(firstDataRow).getCell(column));
  }
}

function applyBottomBorderAcrossRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  startColumn: number,
  endColumn: number,
) {
  for (let column = startColumn; column <= endColumn; column += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(column);
    cell.border = {
      ...cell.border,
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  }
}

function appendProfileSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  profile: AttendanceExportProfile,
  exportContext: TimesheetExportContext,
): ProfileSectionLayout {
  const dayRows = buildDayRows(exportContext);

  const totalWorkingMinutes = exportContext.adjustedCalendarDays.reduce((total, day) => {
    if (typeof day.workingMinutes !== "number" || !Number.isFinite(day.workingMinutes)) {
      return total;
    }
    return total + Math.max(0, day.workingMinutes);
  }, 0);
  const totalLateMinutes = exportContext.adjustedCalendarDays.reduce((total, day) => {
    if (typeof day.lateMinutes !== "number" || !Number.isFinite(day.lateMinutes)) {
      return total;
    }
    return total + Math.max(0, day.lateMinutes);
  }, 0);
  const totalEarlyLeaveMinutes = exportContext.adjustedCalendarDays.reduce((total, day) => {
    if (typeof day.earlyLeaveMinutes !== "number" || !Number.isFinite(day.earlyLeaveMinutes)) {
      return total;
    }
    return total + Math.max(0, day.earlyLeaveMinutes);
  }, 0);
  const totalWorkCredit = exportContext.adjustedCalendarDays.reduce(
    (total, day) => total + formatWorkdayCredit(day),
    0,
  );

  worksheet.mergeCells(`A${startRow}:L${startRow}`);
  const infoCell = worksheet.getCell(`A${startRow}`);
  infoCell.value =
    `Tên nhân viên: ${profile.name}    Chức vụ: ${translateRoleLabel(profile.roleLabel)} ${profile.departmentLabel ? `- ${profile.departmentLabel}` : ""}`;
  infoCell.font = INFO_ROW_FONT;
  infoCell.alignment = { horizontal: "left", vertical: "middle" };
  setCellFill(infoCell, HIGHLIGHT_YELLOW);
  setRowHeight(worksheet, startRow, 34);

  writeSummaryLabel(worksheet, `A${startRow + 2}:B${startRow + 2}`, "Tổng giờ");
  writeSummaryValue(worksheet, `C${startRow + 2}:D${startRow + 2}`, formatHoursDecimal(totalWorkingMinutes));
  writeSummaryLabel(worksheet, `E${startRow + 2}:F${startRow + 2}`, "Số phút trễ");
  writeSummaryValue(worksheet, `G${startRow + 2}:H${startRow + 2}`, totalLateMinutes);
  writeSummaryLabel(worksheet, `I${startRow + 2}:J${startRow + 2}`, "Nghỉ CP");
  writeSummaryValue(
    worksheet,
    `K${startRow + 2}:L${startRow + 2}`,
    exportContext.requestDurationSummary.approvedLeaveMinutes,
  );

  writeSummaryLabel(worksheet, `A${startRow + 3}:B${startRow + 3}`, "Tổng công");
  writeSummaryValue(worksheet, `C${startRow + 3}:D${startRow + 3}`, Number(totalWorkCredit.toFixed(2)));
  writeSummaryLabel(worksheet, `E${startRow + 3}:F${startRow + 3}`, "Số phút về sớm");
  writeSummaryValue(worksheet, `G${startRow + 3}:H${startRow + 3}`, totalEarlyLeaveMinutes);
  writeSummaryLabel(worksheet, `I${startRow + 3}:J${startRow + 3}`, "Nghỉ KP");
  writeSummaryValue(
    worksheet,
    `K${startRow + 3}:L${startRow + 3}`,
    exportContext.requestDurationSummary.unauthorizedLeaveMinutes,
  );

  writeSummaryLabel(worksheet, `A${startRow + 4}:B${startRow + 4}`, "Tăng ca");
  writeSummaryValue(
    worksheet,
    `C${startRow + 4}:D${startRow + 4}`,
    formatHoursDecimal(exportContext.adjustedAttendanceStats.overtimeMinutes),
  );
  writeSummaryLabel(worksheet, `E${startRow + 4}:F${startRow + 4}`, "Tổng số phút thiếu");
  writeSummaryValue(
    worksheet,
    `G${startRow + 4}:H${startRow + 4}`,
    exportContext.adjustedAttendanceStats.missingMinutes,
  );

  const headerRowIndex = startRow + 6;
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.values = [
    "Ngày",
    "Thứ",
    "Vào",
    "Ra",
    "Trễ",
    "Về sớm",
    "Giờ",
    "Công",
    "Tăng ca",
    "Tổng công",
    "Số buổi đi muộn",
    "Phạt",
  ];
  headerRow.font = BOLD_FONT;
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  dayRows.forEach((dayRow, index) => {
    const rowNumber = headerRowIndex + 1 + index;
    const row = worksheet.getRow(rowNumber);
    row.values = dayRow.values;
    row.alignment = { horizontal: "center", vertical: "middle" };

    if (dayRow.isSunday) {
      for (let column = 1; column <= 9; column += 1) {
        setCellFill(row.getCell(column), SUNDAY_BLUE);
      }
      return;
    }

    if (
      dayRow.hasCheckIn &&
      dayRow.hasCheckOut &&
      (dayRow.workingMinutes < REQUIRED_WORK_MINUTES || dayRow.lateMinutes > 0)
    ) {
      setCellFill(row.getCell(3), HIGHLIGHT_YELLOW);
      setCellFill(row.getCell(4), HIGHLIGHT_YELLOW);
    }

    if (dayRow.workingMinutes < REQUIRED_WORK_MINUTES && dayRow.workingMinutes > 0) {
      worksheet.getCell(`G${rowNumber}`).numFmt = "0.00";
    }

    worksheet.getCell(`G${rowNumber}`).numFmt = "0.00";
    worksheet.getCell(`H${rowNumber}`).numFmt = "0.00";
    worksheet.getCell(`I${rowNumber}`).numFmt = "0.00";
    worksheet.getCell(`E${rowNumber}`).numFmt = "0.00";
    worksheet.getCell(`F${rowNumber}`).numFmt = "0.00";
    worksheet.getCell(`L${rowNumber}`).numFmt = "#,##0";
  });

  return {
    infoStartRow: startRow,
    infoEndRow: startRow + 4,
    tableHeaderRow: headerRowIndex,
    tableFirstDataRow: headerRowIndex + 1,
    tableLastDataRow: headerRowIndex + dayRows.length,
    penaltyCellAddress: `L${headerRowIndex + 1}`,
  };
}

function buildPenaltySummarySheet(
  workbook: ExcelJS.Workbook,
  entries: Array<{
    profile: AttendanceExportProfile;
    exportContext: TimesheetExportContext;
  }>,
  layouts: ProfileSectionLayout[],
) {
  const worksheet = workbook.addWorksheet("Tiền phạt");
  worksheet.properties.defaultRowHeight = 20;
  worksheet.columns = [
    { key: "index", width: 10 },
    { key: "name", width: 28 },
    { key: "role", width: 24 },
    { key: "department", width: 24 },
    { key: "penalty", width: 18 },
  ];

  const title = entries[0]
    ? formatPenaltySheetTitle(entries[0].exportContext.selectedMonth)
    : "TỔNG HỢP TIỀN PHẠT";

  worksheet.mergeCells("A1:E1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  setRowHeight(worksheet, 1, 38);

  const headerRow = worksheet.getRow(3);
  headerRow.values = ["STT", "Tên nhân viên", "Chức vụ", "Phòng ban", "Số tiền phạt"];
  headerRow.font = BOLD_FONT;
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  for (let column = 1; column <= 5; column += 1) {
    setCellBorder(headerRow.getCell(column));
  }

  entries.forEach(({ profile }, index) => {
    const layout = layouts[index];
    const rowNumber = 4 + index;
    const row = worksheet.getRow(rowNumber);
    row.getCell(1).value = index + 1;
    row.getCell(2).value = profile.name;
    row.getCell(3).value = translateRoleLabel(profile.roleLabel);
    row.getCell(4).value = profile.departmentLabel || "";
    row.getCell(5).value = {
      formula: `'Chấm công'!${layout.penaltyCellAddress}`,
    };

    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(4).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(5).numFmt = "#,##0";

    for (let column = 1; column <= 5; column += 1) {
      setCellBorder(row.getCell(column));
    }
  });

  const totalRowNumber = 4 + entries.length;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(1).value = "Tổng";
  mergeCells(worksheet, `A${totalRowNumber}:D${totalRowNumber}`);
  totalRow.getCell(1).font = BOLD_FONT;
  totalRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  totalRow.getCell(5).value =
    entries.length > 0
      ? {
          formula: `SUM(E4:E${totalRowNumber - 1})`,
        }
      : 0;
  totalRow.getCell(5).font = BOLD_FONT;
  totalRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
  totalRow.getCell(5).numFmt = "#,##0";

  for (let column = 1; column <= 5; column += 1) {
    setCellBorder(totalRow.getCell(column));
  }

  setBaseSheetStyle(worksheet);
}

export async function buildAttendanceWorkbookBuffer(
  entries: Array<{
    profile: AttendanceExportProfile;
    exportContext: TimesheetExportContext;
  }>,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TCM";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const worksheet = workbook.addWorksheet("Chấm công");
  worksheet.properties.defaultRowHeight = 20;
  worksheet.columns = [
    { key: "date", width: 16 },
    { key: "weekday", width: 16 },
    { key: "checkIn", width: 16 },
    { key: "checkOut", width: 16 },
    { key: "late", width: 14 },
    { key: "early", width: 16 },
    { key: "hours", width: 14 },
    { key: "credit", width: 14 },
    { key: "overtime", width: 16 },
    { key: "manualTotal", width: 16 },
    { key: "manualLateSessions", width: 20 },
    { key: "manualPenalty", width: 16 },
  ];

  const monthTitle = entries[0]
    ? formatMonthTitle(entries[0].exportContext.selectedMonth)
    : "BẢNG CHI TIẾT CHẤM CÔNG";

  worksheet.mergeCells("A1:L1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = monthTitle;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  setRowHeight(worksheet, 1, 38);

  let currentRow = 3;
  const layouts: ProfileSectionLayout[] = [];
  entries.forEach(({ profile, exportContext }) => {
    const layout = appendProfileSection(worksheet, currentRow, profile, exportContext);
    layouts.push(layout);
    currentRow = layout.tableLastDataRow + 3;
  });

  setBaseSheetStyle(worksheet);

  layouts.forEach((layout) => {
    applyOuterBorderOnly(worksheet, layout.infoStartRow, layout.infoEndRow, 1, 12);
    applyBottomBorderAcrossRow(worksheet, layout.infoStartRow, 1, 12);
    applyDailyTableBorders(
      worksheet,
      layout.tableHeaderRow,
      layout.tableFirstDataRow,
      layout.tableLastDataRow,
    );
  });

  buildPenaltySummarySheet(workbook, entries, layouts);

  return workbook.xlsx.writeBuffer();
}
