import { getVerifiedProductionUser } from "@/lib/production-access";
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

  const memberships = await prisma.productionOrganizationMembership.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      organization: { select: { id: true, name: true } },
    },
  });

  const organizations = memberships
    .map(({ role, organization }) => ({ ...organization, role }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return NextResponse.json(
    { organizations },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
