export type TimekeepingReadProfile = {
  is_timekeeping_enabled?: boolean | null;
};

export type TimekeepingCreateProfile = {
  is_active?: boolean | null;
  is_timekeeping_enabled?: boolean | null;
};

export const TIMEKEEPING_DISABLED_MESSAGE =
  "Nhân sự này không còn hoạt động hoặc không được bật tính công.";

export function canReadTimekeepingData(profile?: TimekeepingReadProfile | null) {
  return profile?.is_timekeeping_enabled === true;
}

export function canCreateTimeRequest(profile?: TimekeepingCreateProfile | null) {
  return profile?.is_active === true && profile?.is_timekeeping_enabled === true;
}
