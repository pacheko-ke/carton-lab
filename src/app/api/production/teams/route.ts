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

  const memberships = await prisma.productionMembership.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      team: { select: { id: true, name: true } },
    },
  });

  const teams = memberships
    .map(({ role, team }) => ({ ...team, role }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return NextResponse.json(
    { teams },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
