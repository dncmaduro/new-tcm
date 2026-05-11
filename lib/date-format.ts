const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const date = DATE_ONLY_PATTERN.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

export const formatDateDdMmYyyy = (
  value: string | null | undefined,
  fallback = "Chưa có",
  invalidFallback = "Không hợp lệ",
) => {
  if (!value) {
    return fallback;
  }

  const date = toDate(String(value));
  if (!date) {
    return invalidFallback;
  }

  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const formatDateTimeDdMmYyyy = (
  value: string | null | undefined,
  fallback = "Chưa có",
  invalidFallback = "Không hợp lệ",
) => {
  if (!value) {
    return fallback;
  }

  const date = toDate(String(value));
  if (!date) {
    return invalidFallback;
  }

  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
};

