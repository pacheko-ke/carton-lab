"use server";

import { ProductionRole, Prisma } from "@prisma/client";
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
  if (role !== ProductionRole.DESIGNER && role !== ProductionRole.PRODUCTION) {
    throw new Error("Choose a valid production role.");
  }
  return role;
}

export async function createProductionTeam(formData: FormData) {
  await requireAdminUser();
  const name = readString(formData, "name", 100);

  try {
    await prisma.productionTeam.create({ data: { name } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect("/admin/production?error=duplicate-team");
    }
    throw error;
  }

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=team-created");
}

export async function saveProductionMembership(formData: FormData) {
  await requireAdminUser();
  const teamId = readString(formData, "teamId", 100);
  const email = readString(formData, "email", 254).toLowerCase();
  const role = readRole(formData);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/admin/production?error=invalid-email");
  }

  const team = await prisma.productionTeam.findUnique({
    where: { id: teamId },
    select: { id: true },
  });
  if (!team) {
    redirect("/admin/production?error=team-not-found");
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

  await prisma.productionMembership.upsert({
    where: { teamId_userId: { teamId, userId: user.id } },
    create: { teamId, userId: user.id, role },
    update: { role },
  });

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=membership-saved");
}

export async function removeProductionMembership(formData: FormData) {
  await requireAdminUser();
  const teamId = readString(formData, "teamId", 100);
  const userId = readString(formData, "userId", 100);

  await prisma.productionMembership.deleteMany({
    where: { teamId, userId },
  });

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=membership-removed");
}
