import { getProductionRoleTag } from "@/lib/access-control";
import {
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { getCompanyMembership } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const [role, companyMembership] = await Promise.all([
    getProductionRoleTag(user.id),
    getCompanyMembership(user.id),
  ]);
  const companies = isProductionAdmin(user)
    ? await prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : companyMembership
      ? [companyMembership.company]
      : [];
  const workspaces = role
    ? companies.map((company) => ({ id: company.id, name: company.name, role }))
    : [];

  return NextResponse.json(
    { workspaces },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
