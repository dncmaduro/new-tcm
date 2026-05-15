export type AttendanceLinkValue = {
  attendance_id: unknown;
} | null | undefined;

export type AttendanceDeviceLinkValue = {
  attendance_id: unknown;
  device_id?: unknown;
} | null | undefined;

export type AttendanceTimeRow = {
  id: string;
  attendance_id: number | null;
  device_id?: number | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MergedAttendanceTimeRow = AttendanceTimeRow & {
  attendance_ids: number[];
};

export type AttendanceDeviceLink = {
  attendanceId: number;
  deviceId: number | null;
};

export function normalizeAttendanceId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeDeviceId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(normalized)) {
    return null;
  }

  return normalized;
}

export function collectAttendanceIds(values: Array<unknown | AttendanceLinkValue>) {
  const normalizedValues = values
    .map((item) =>
      item && typeof item === "object" && "attendance_id" in item
        ? normalizeAttendanceId(item.attendance_id)
        : normalizeAttendanceId(item),
    )
    .filter((item): item is number => item !== null);

  return Array.from(new Set(normalizedValues)).sort((a, b) => a - b);
}

export function collectAttendanceDeviceLinks(values: AttendanceDeviceLinkValue[]) {
  const links = values.reduce<AttendanceDeviceLink[]>((acc, item) => {
    if (!item || typeof item !== "object" || !("attendance_id" in item)) {
      return acc;
    }

    const attendanceId = normalizeAttendanceId(item.attendance_id);
    if (attendanceId === null) {
      return acc;
    }

    const deviceId = "device_id" in item ? normalizeDeviceId(item.device_id) : null;
    acc.push({ attendanceId, deviceId });
    return acc;
  }, []);

  return Array.from(
    new Map(
      links.map((link) => [`${link.attendanceId}:${link.deviceId ?? "null"}`, link] as const),
    ).values(),
  ).sort((a, b) => {
    if (a.attendanceId !== b.attendanceId) {
      return a.attendanceId - b.attendanceId;
    }

    if (a.deviceId === b.deviceId) {
      return 0;
    }

    if (a.deviceId === null) {
      return -1;
    }

    if (b.deviceId === null) {
      return 1;
    }

    return a.deviceId - b.deviceId;
  });
}

export function buildTimesDeviceFilter(links: AttendanceDeviceLink[]) {
  const deviceIdsByAttendanceId = links.reduce<Map<number, Set<number | null>>>((acc, link) => {
    const existing = acc.get(link.attendanceId) ?? new Set<number | null>();
    existing.add(link.deviceId);
    acc.set(link.attendanceId, existing);
    return acc;
  }, new Map());

  return Array.from(deviceIdsByAttendanceId.entries())
    .map(([attendanceId, deviceIds]) => {
      if (deviceIds.size !== 1 || deviceIds.has(null)) {
        return `attendance_id.eq.${attendanceId}`;
      }

      const [deviceId] = Array.from(deviceIds);
      return `and(attendance_id.eq.${attendanceId},device_id.eq.${deviceId})`;
    })
    .join(",");
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getTime();
}

function getRowRank(row: AttendanceTimeRow) {
  let rank = 0;
  if (row.check_in) {
    rank += 1;
  }
  if (row.check_out) {
    rank += 1;
  }
  return rank;
}

export function mergeAttendanceRowsByDate(rows: AttendanceTimeRow[]) {
  const rowsByDate = rows.reduce<Map<string, AttendanceTimeRow[]>>((acc, row) => {
    if (!row.date) {
      return acc;
    }

    const existing = acc.get(row.date) ?? [];
    existing.push(row);
    acc.set(row.date, existing);
    return acc;
  }, new Map());

  return Array.from(rowsByDate.entries())
    .map(([date, groupedRows]) => {
      let earliestCheckIn: string | null = null;
      let earliestCheckInTs = Number.POSITIVE_INFINITY;
      let latestCheckOut: string | null = null;
      let latestCheckOutTs = Number.NEGATIVE_INFINITY;

      const attendanceIds = collectAttendanceIds(groupedRows);
      const primaryRow = groupedRows.reduce<AttendanceTimeRow>((best, current) => {
        const bestRank = getRowRank(best);
        const currentRank = getRowRank(current);
        if (currentRank !== bestRank) {
          return currentRank > bestRank ? current : best;
        }

        const bestTs = toTimestamp(best.updated_at) ?? toTimestamp(best.created_at) ?? 0;
        const currentTs = toTimestamp(current.updated_at) ?? toTimestamp(current.created_at) ?? 0;
        return currentTs >= bestTs ? current : best;
      }, groupedRows[0]);

      groupedRows.forEach((row) => {
        const checkInTs = toTimestamp(row.check_in);
        if (checkInTs !== null && checkInTs < earliestCheckInTs) {
          earliestCheckInTs = checkInTs;
          earliestCheckIn = row.check_in;
        }

        const checkOutTs = toTimestamp(row.check_out);
        if (checkOutTs !== null && checkOutTs > latestCheckOutTs) {
          latestCheckOutTs = checkOutTs;
          latestCheckOut = row.check_out;
        }
      });

      return {
        ...primaryRow,
        date,
        attendance_id: attendanceIds[0] ?? normalizeAttendanceId(primaryRow.attendance_id),
        check_in: earliestCheckIn,
        check_out: latestCheckOut,
        attendance_ids: attendanceIds,
      } satisfies MergedAttendanceTimeRow;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
