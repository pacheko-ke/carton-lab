import { getProductionRoleTag } from "@/lib/access-control";
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

  const role = await getProductionRoleTag(user.id);
  const organizations = role
    ? (await prisma.productionOrganization.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })).map((organization) => ({ ...organization, role }))
    : [];

  return NextResponse.json(
    { organizations },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
