"use client";

import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";

export type ManagedDepartment = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

export function useManagementAccess() {
  const access = useWorkspaceAccess();

  return {
    isLoading: access.isLoading,
    profileId: access.profileId,
    profileName: access.profileName,
    managedDepartments: access.managedDepartments,
    canManage: access.canManage,
    error: access.error,
  };
}
