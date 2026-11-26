"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin";
import { ACCESS_PERMISSIONS } from "@/lib/access-control";
import { isAdminEmail } from "@/lib/admin-email";
import { prisma } from "@/lib/prisma";

function readRequiredField(formData: FormData, name: string, maxLength: number) {
  const value = formData.get(name);
  if (typeof value !== "string") throw new Error(`Missing ${name}.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`${name} must be 1-${maxLength} characters.`);
  }
  return trimmed;
}

function readPermissions(formData: FormData) {
  const permissions = [
    ...new Set(
      formData.getAll("permission").map((permission) => {
        if (typeof permission !== "string") {
          throw new Error("Invalid role permissions.");
        }
        return permission;
      }),
    ),
  ];
  if (permissions.some((permission) =>
    !ACCESS_PERMISSIONS.some((available) => available.key === permission),
  )) {
    throw new Error("Choose permissions from the available list.");
  }
  return permissions;
}

function revalidateAccessPages() {
  revalidatePath("/admin");
  revalidatePath("/admin/access-control");
  revalidatePath("/production/admin");
  revalidatePath("/app");
}

export async function createAccessRole(formData: FormData) {
  await requireAdminUser();
  const name = readRequiredField(formData, "name", 60);
  const descriptionValue = formData.get("description");
  if (typeof descriptionValue !== "string" || descriptionValue.trim().length > 180) {
    throw new Error("Description must be 0-180 characters.");
  }
  const isSuperAdmin = formData.get("isSuperAdmin") === "on";
  const permissions = isSuperAdmin ? ["*"] : readPermissions(formData);
  const keyStem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const key = `${keyStem.slice(0, 40) || "custom-role"}-${randomUUID().slice(0, 8)}`;

  await prisma.accessRole.create({
    data: {
      key,
      name,
      description: descriptionValue.trim(),
      permissions,
      isSuperAdmin,
    },
  });
  revalidateAccessPages();
}

export async function updateAccessRole(formData: FormData) {
  await requireAdminUser();
  const id = readRequiredField(formData, "roleId", 100);
  const name = readRequiredField(formData, "name", 60);
  const descriptionValue = formData.get("description");
  if (typeof descriptionValue !== "string" || descriptionValue.trim().length > 180) {
    throw new Error("Description must be 0-180 characters.");
  }
  const role = await prisma.accessRole.findUnique({
    where: { id },
    select: { id: true, isSuperAdmin: true },
  });
  if (!role) throw new Error("Role not found.");
  if (role.isSuperAdmin) {
    throw new Error("Super-admin access cannot be changed through role editing.");
  }

  await prisma.accessRole.update({
    where: { id },
    data: {
      name,
      description: descriptionValue.trim(),
      permissions: readPermissions(formData),
    },
  });
  revalidateAccessPages();
}

export async function deleteAccessRole(formData: FormData) {
  await requireAdminUser();
  const id = readRequiredField(formData, "roleId", 100);
  const role = await prisma.accessRole.findUnique({
    where: { id },
    select: {
      id: true,
      isSystem: true,
      isSuperAdmin: true,
      _count: { select: { assignments: true } },
    },
  });
  if (!role) throw new Error("Role not found.");
  if (role.isSystem) throw new Error("Built-in roles cannot be deleted.");
  if (role.isSuperAdmin) throw new Error("Super-admin roles cannot be deleted.");
  if (role._count.assignments) {
    throw new Error("Remove this role from every user before deleting it.");
  }

  await prisma.accessRole.delete({ where: { id } });
  revalidateAccessPages();
}

export async function assignAccessRole(formData: FormData) {
  const admin = await requireAdminUser();
  const email = readRequiredField(formData, "email", 254).toLowerCase();
  const roleId = readRequiredField(formData, "roleId", 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const [user, role] = await Promise.all([
    prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        emailVerified: { not: null },
      },
      select: { id: true },
    }),
    prisma.accessRole.findUnique({
      where: { id: roleId },
      select: { id: true },
    }),
  ]);
  if (!user) throw new Error("A registered, verified account is required.");
  if (!role) throw new Error("Choose a valid role.");

  await prisma.userAccessRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id, assignedByUserId: admin.id },
    update: { assignedByUserId: admin.id, assignedAt: new Date() },
  });
  revalidateAccessPages();
}

export async function removeAccessRole(formData: FormData) {
  const admin = await requireAdminUser();
  const userId = readRequiredField(formData, "userId", 100);
  const roleId = readRequiredField(formData, "roleId", 100);
  await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.userAccessRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      select: { role: { select: { isSuperAdmin: true } } },
    });
    if (!assignment) throw new Error("Role assignment not found.");

    if (assignment.role.isSuperAdmin) {
      const remainingAssignments = await transaction.userAccessRole.count({
        where: { role: { isSuperAdmin: true } },
      });
      const configuredAdmins = isAdminEmail(admin.email) ? 1 : 0;
      if (remainingAssignments <= 1 && !configuredAdmins) {
        throw new Error("At least one super administrator must remain assigned.");
      }
    }

    await transaction.userAccessRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidateAccessPages();
}
