import { prisma } from "@/lib/prisma";

export const companyDetailsSelect = {
  id: true,
  name: true,
  country: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  timezone: true,
  currency: true,
  logoUrl: true,
  employeeNumberNext: true,
  hrDepartments: true,
  hrJobTitles: true,
  hrWorkAreas: true,
} as const;

export async function getCompanyMembership(userId: string) {
  return prisma.companyMembership.findUnique({
    where: { userId },
    include: { company: { select: companyDetailsSelect } },
  });
}

export function canManageCompany(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
