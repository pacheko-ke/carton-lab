"use server";

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

export async function createProductionOrganization(formData: FormData) {
  await requireAdminUser();
  const name = readString(formData, "name", 100);

  await prisma.productionOrganization.create({ data: { name } });

  revalidatePath("/admin/production");
  redirect("/admin/production?notice=organization-created");
}
