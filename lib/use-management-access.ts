"use client";

import { useMemo } from "react";
import { useWorkspaceAccess } from "@/lib/stores/workspace-access-store";

export type ManagedDepartment = {
  id: string;
  name: string;
  parentDepartmentId: string | null;
};

export type ManageableDepartmentOption = ManagedDepartment & {
  pathLabel: string;
};

const buildDepartmentPathLabel = (
  departmentId: string,
  departmentsById: Record<string, ManagedDepartment>,
) => {
  const parts: string[] = [];
  let currentDepartmentId: string | null = departmentId;
  const visitedDepartmentIds = new Set<string>();

  while (currentDepartmentId) {
    if (visitedDepartmentIds.has(currentDepartmentId)) {
      break;
    }

    visitedDepartmentIds.add(currentDepartmentId);
    const department = departmentsById[currentDepartmentId];
    if (!department) {
      break;
    }

    parts.unshift(department.name);
    currentDepartmentId = department.parentDepartmentId;
  }

  return parts.join(" / ");
};

export function useManagementAccess() {
  const access = useWorkspaceAccess();
  const manageableDepartments = useMemo(() => {
    const departmentsById = access.departments.reduce<Record<string, ManagedDepartment>>((acc, department) => {
      acc[department.id] = department;
      return acc;
    }, {});

    const manageableDepartmentIds = new Set<string>();

    if (access.hasDirectorRole) {
      access.departments.forEach((department) => manageableDepartmentIds.add(department.id));
    } else {
      const queue = access.managedDepartments.map((department) => department.id);
      queue.forEach((departmentId) => manageableDepartmentIds.add(departmentId));

      while (queue.length > 0) {
        const currentDepartmentId = queue.shift() as string;
        access.departments.forEach((department) => {
          if (department.parentDepartmentId !== currentDepartmentId || manageableDepartmentIds.has(department.id)) {
            return;
          }
          manageableDepartmentIds.add(department.id);
          queue.push(department.id);
        });
      }
    }

    return access.departments
      .filter((department) => manageableDepartmentIds.has(department.id))
      .map((department) => ({
        ...department,
        pathLabel: buildDepartmentPathLabel(department.id, departmentsById),
      }))
      .sort((a, b) => a.pathLabel.localeCompare(b.pathLabel, "vi"));
  }, [access.departments, access.hasDirectorRole, access.managedDepartments]);

  return {
    isLoading: access.isLoading,
    profileId: access.profileId,
    profileName: access.profileName,
    managedDepartments: access.managedDepartments,
    manageableDepartments,
    canManage: access.canManage,
    error: access.error,
  };
}
