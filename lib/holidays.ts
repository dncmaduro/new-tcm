import type { SupabaseClient } from "@supabase/supabase-js";

export type Holiday = {
  id: string;
  date: string;
  name: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function toLocalDateKey(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return toLocalDateKey(parsed);
  }

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildHolidayMap(holidays: Holiday[]) {
  return holidays.reduce<Map<string, Holiday>>((acc, holiday) => {
    const dateKey = toLocalDateKey(holiday.date);
    if (!dateKey) {
      return acc;
    }

    acc.set(dateKey, holiday);
    return acc;
  }, new Map<string, Holiday>());
}

export function getHoliday(date: Date | string | null | undefined, holidays: Holiday[]) {
  const dateKey = toLocalDateKey(date);
  if (!dateKey) {
    return null;
  }

  return holidays.find((holiday) => toLocalDateKey(holiday.date) === dateKey) ?? null;
}

export function isHoliday(date: Date | string | null | undefined, holidays: Holiday[]) {
  return getHoliday(date, holidays) !== null;
}

export async function fetchHolidaysInRange(
  supabaseClient: SupabaseClient,
  startDate: Date | string,
  endDate: Date | string,
) {
  const startKey = toLocalDateKey(startDate);
  const endKey = toLocalDateKey(endDate);

  if (!startKey || !endKey) {
    return [] as Holiday[];
  }

  try {
    const { data, error } = await supabaseClient
      .from("holidays")
      .select("id,date,name,note,created_at,updated_at")
      .gte("date", startKey)
      .lte("date", endKey)
      .order("date", { ascending: true });

    if (error) {
      throw error;
    }

    return ((data ?? []) as Holiday[]).map((item) => ({
      id: String(item.id),
      date: toLocalDateKey(item.date),
      name: String(item.name),
      note: item.note ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  } catch (error) {
    console.error("[holidays] Failed to load holidays", {
      startKey,
      endKey,
      error,
    });
    return [] as Holiday[];
  }
}
