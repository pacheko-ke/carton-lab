"use server";

import { ProductionRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

function readString(formData: FormData, name: string, maxLength: number) {
  const value = formData.get(name);
  if (typeof value !== "string") {
    throw new Error(`Missing ${name} value.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`${name} must be 1-${maxLength} characters.`);
  }
  return trimmed;
}

function readRole(formData: FormData) {
  const role = formData.get("role");
  if (
    role !== ProductionRole.DESIGNER &&
    role !== ProductionRole.PRODUCTION &&
    role !== ProductionRole.ORDER_BOOKER
  ) {
    throw new Error("Choose a valid production role.");
  }
  return role;
}

export async function createProductionOrganization(formData: FormData) {
  await requireAdminUser();
  const name = readString(formData, "name", 100);

  await prisma.productionOrganization.create({ data: { name } });

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=organization-created");
}

export async function saveProductionOrganizationMembership(formData: FormData) {
  await requireAdminUser();
  const organizationId = readString(formData, "organizationId", 100);
  const email = readString(formData, "email", 254).toLowerCase();
  const role = readRole(formData);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/admin/production?error=invalid-email");
  }

  const organization = await prisma.productionOrganization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) {
    redirect("/admin/production?error=organization-not-found");
  }

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      emailVerified: { not: null },
    },
    select: { id: true },
  });
  if (!user) {
    redirect("/admin/production?error=verified-user-required");
  }

  await prisma.productionOrganizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    create: { organizationId, userId: user.id, role },
    update: { role },
  });

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=organization-membership-saved");
}

export async function removeProductionOrganizationMembership(formData: FormData) {
  await requireAdminUser();
  const organizationId = readString(formData, "organizationId", 100);
  const userId = readString(formData, "userId", 100);

  await prisma.productionOrganizationMembership.deleteMany({
    where: { organizationId, userId },
  });

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=organization-membership-removed");
}
