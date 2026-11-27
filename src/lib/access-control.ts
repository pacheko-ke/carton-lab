import type { Prisma } from "@prisma/client";
import { getConfiguredAdminEmails, isAdminEmail } from "@/lib/admin-email";
import { prisma } from "@/lib/prisma";

type AccessPermissionGroup = {
  name: string;
  permissions: readonly { key: string; label: string }[];
};

export const ACCESS_PERMISSION_GROUPS = [
  {
    name: "PackStudio",
    permissions: [
      { key: "keylines.use", label: "Use keyline tools and bookmarks" },
    ],
  },
  {
    name: "Production",
    permissions: [
      { key: "production.view", label: "View production workspaces and records" },
      { key: "production.manage", label: "Manage production jobs and operations" },
      { key: "production.design", label: "Manage Origination, artwork, and job flags" },
      { key: "production.orders.book", label: "Book customer orders" },
      { key: "production.catalog.manage", label: "Manage products and customer catalogs" },
      { key: "production.payroll.manage", label: "Manage employee pay and payroll runs" },
    ],
  },
] as const satisfies readonly AccessPermissionGroup[];

export type AccessPermission =
  (typeof ACCESS_PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ACCESS_PERMISSIONS = ACCESS_PERMISSION_GROUPS.reduce<
  { key: AccessPermission; label: string }[]
>((permissions, group) => {
  permissions.push(...group.permissions);
  return permissions;
}, []);

const accessSnapshotSelection = {
  id: true,
  name: true,
  companyName: true,
  email: true,
  emailVerified: true,
  accessRoles: {
    select: {
      role: {
        select: {
          id: true,
          key: true,
          name: true,
          permissions: true,
          isSuperAdmin: true,
          isSystem: true,
        },
      },
    },
  },
} as const;

export async function getUserAccessSnapshot(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: accessSnapshotSelection,
  });
  if (!user) return null;

  const roles = user.accessRoles.map(({ role }) => role);
  const isSuperAdmin =
    isAdminEmail(user.email) || roles.some((role) => role.isSuperAdmin);
  const permissions = new Set(roles.flatMap((role) => role.permissions));
  if (isSuperAdmin) permissions.add("*");

  return {
    user,
    roles,
    permissions: [...permissions],
    isSuperAdmin,
  };
}

export async function hasAccessPermission(
  userId: string,
  permission: string,
): Promise<boolean> {
  const access = await getUserAccessSnapshot(userId);
  return Boolean(
    access?.isSuperAdmin ||
      access?.permissions.includes("*") ||
      access?.permissions.includes(permission),
  );
}

export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const access = await getUserAccessSnapshot(userId);
  return Boolean(access?.isSuperAdmin);
}

export async function getProductionRoleCapabilities(userId: string) {
  const access = await getUserAccessSnapshot(userId);
  if (!access) return [];
  if (access.isSuperAdmin) {
    return ["VIEWER", "PRODUCTION", "DESIGNER", "ORDER_BOOKER"];
  }

  const permissions = access.permissions;
  const hasProductionAccess = permissions.some((permission) =>
    permission.startsWith("production."),
  );
  if (!hasProductionAccess) return [];

  const roles = new Set<string>(["VIEWER"]);
  if (permissions.includes("production.manage")) roles.add("PRODUCTION");
  if (permissions.includes("production.design")) roles.add("DESIGNER");
  if (
    permissions.includes("production.orders.book") ||
    permissions.includes("production.catalog.manage")
  ) {
    roles.add("ORDER_BOOKER");
  }
  return [...roles];
}

export async function getProductionRoleTag(userId: string) {
  return (await getProductionRoleCapabilities(userId)).join("|");
}

export async function getProductionDesignUserIds() {
  const assignments = await prisma.userAccessRole.findMany({
    select: {
      userId: true,
      role: { select: { isSuperAdmin: true, permissions: true } },
    },
  });
  const userIds = assignments
    .filter(({ role }) =>
      role.isSuperAdmin || role.permissions.includes("production.design"),
    )
    .map(({ userId }) => userId);

  const bootstrapAdmins = await prisma.user.findMany({
    where: { email: { in: getConfiguredAdminEmails() } },
    select: { id: true },
  });
  return [...new Set([...userIds, ...bootstrapAdmins.map(({ id }) => id)])];
}

export async function assignDefaultAccessRole(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  await transaction.userAccessRole.upsert({
    where: { userId_roleId: { userId, roleId: "access-role-member" } },
    create: { userId, roleId: "access-role-member" },
    update: {},
  });
}
