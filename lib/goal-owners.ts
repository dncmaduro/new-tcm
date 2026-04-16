import { supabase } from "@/lib/supabase";

export type GoalOwnerLinkRow = {
  goal_id: string | null;
  profile_id: string | null;
};

export type GoalOwnerProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  avatar?: string | null;
};

export type GoalOwnerProfile = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
};

type GoalOwnersSummaryOptions = {
  emptyLabel?: string;
  limit?: number;
};

const DEFAULT_EMPTY_LABEL = "Chưa có người phụ trách";

export const formatGoalOwnerName = (profile: {
  name?: string | null;
  email?: string | null;
}) => profile.name?.trim() || profile.email?.trim() || "Chưa có tên";

export const buildGoalOwnersByGoalId = (
  links: GoalOwnerLinkRow[],
  profiles: GoalOwnerProfileRow[],
) => {
  const profilesById = profiles.reduce<Record<string, GoalOwnerProfile>>((acc, profile) => {
    const profileId = String(profile.id);
    acc[profileId] = {
      id: profileId,
      name: formatGoalOwnerName(profile),
      email: profile.email ? String(profile.email) : null,
      avatar: profile.avatar ? String(profile.avatar) : null,
    };
    return acc;
  }, {});

  return links.reduce<Record<string, GoalOwnerProfile[]>>((acc, link) => {
    const goalId = link.goal_id ? String(link.goal_id) : null;
    const profileId = link.profile_id ? String(link.profile_id) : null;

    if (!goalId || !profileId || !profilesById[profileId]) {
      return acc;
    }

    if (!acc[goalId]) {
      acc[goalId] = [];
    }

    if (!acc[goalId].some((item) => item.id === profileId)) {
      acc[goalId].push(profilesById[profileId]);
    }

    return acc;
  }, {});
};

export const formatGoalOwnersSummary = (
  owners: GoalOwnerProfile[],
  options?: GoalOwnersSummaryOptions,
) => {
  if (!owners.length) {
    return options?.emptyLabel ?? DEFAULT_EMPTY_LABEL;
  }

  const limit = options?.limit ?? 2;
  const visibleOwners = owners.slice(0, limit).map((owner) => owner.name);

  if (owners.length <= limit) {
    return visibleOwners.join(", ");
  }

  return `${visibleOwners.join(", ")} +${owners.length - limit}`;
};

export const getGoalOwnerSearchText = (owners: GoalOwnerProfile[]) =>
  owners.map((owner) => `${owner.name} ${owner.email ?? ""}`.trim()).join(" ");

export const loadGoalOwnersByGoalIds = async (goalIds: string[]) => {
  const normalizedGoalIds = [...new Set(goalIds.filter(Boolean))];

  if (!normalizedGoalIds.length) {
    return {} as Record<string, GoalOwnerProfile[]>;
  }

  const { data: goalOwnerRows, error: goalOwnersError } = await supabase
    .from("goal_owners")
    .select("goal_id,profile_id")
    .in("goal_id", normalizedGoalIds);

  if (goalOwnersError) {
    throw new Error(goalOwnersError.message || "Không tải được danh sách owners của mục tiêu.");
  }

  const typedGoalOwnerRows = ((goalOwnerRows ?? []) as GoalOwnerLinkRow[]).map((row) => ({
    goal_id: row.goal_id ? String(row.goal_id) : null,
    profile_id: row.profile_id ? String(row.profile_id) : null,
  }));

  const ownerProfileIds = [
    ...new Set(
      typedGoalOwnerRows
        .map((row) => row.profile_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (!ownerProfileIds.length) {
    return normalizedGoalIds.reduce<Record<string, GoalOwnerProfile[]>>((acc, goalId) => {
      acc[goalId] = [];
      return acc;
    }, {});
  }

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id,name,email,avatar")
    .in("id", ownerProfileIds);

  if (profilesError) {
    throw new Error(profilesError.message || "Không tải được hồ sơ owners của mục tiêu.");
  }

  const ownersByGoalId = buildGoalOwnersByGoalId(
    typedGoalOwnerRows,
    (profilesData ?? []) as GoalOwnerProfileRow[],
  );

  normalizedGoalIds.forEach((goalId) => {
    if (!ownersByGoalId[goalId]) {
      ownersByGoalId[goalId] = [];
    }
  });

  return ownersByGoalId;
};

export const syncGoalOwners = async (goalId: string, ownerIds: string[]) => {
  const normalizedGoalId = String(goalId);
  const normalizedOwnerIds = [...new Set(ownerIds.filter(Boolean).map((ownerId) => String(ownerId)))];

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("goal_owners")
    .select("profile_id")
    .eq("goal_id", normalizedGoalId);

  if (existingRowsError) {
    throw new Error(existingRowsError.message || "Không kiểm tra được danh sách owners hiện tại.");
  }

  const existingOwnerIds = [
    ...new Set(
      ((existingRows ?? []) as Array<{ profile_id: string | null }>)
        .map((row) => (row.profile_id ? String(row.profile_id) : null))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const ownerIdsToAdd = normalizedOwnerIds.filter((ownerId) => !existingOwnerIds.includes(ownerId));
  const ownerIdsToRemove = existingOwnerIds.filter((ownerId) => !normalizedOwnerIds.includes(ownerId));

  if (ownerIdsToAdd.length > 0) {
    const { error: insertOwnersError } = await supabase.from("goal_owners").upsert(
      ownerIdsToAdd.map((profileId) => ({
        goal_id: normalizedGoalId,
        profile_id: profileId,
      })),
      {
        onConflict: "goal_id,profile_id",
      },
    );

    if (insertOwnersError) {
      throw new Error(insertOwnersError.message || "Không thêm được owners mới cho mục tiêu.");
    }
  }

  if (ownerIdsToRemove.length > 0) {
    const { error: deleteOwnersError } = await supabase
      .from("goal_owners")
      .delete()
      .eq("goal_id", normalizedGoalId)
      .in("profile_id", ownerIdsToRemove);

    if (deleteOwnersError) {
      throw new Error(deleteOwnersError.message || "Không xóa được owners cũ của mục tiêu.");
    }
  }
};
