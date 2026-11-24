import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMaintenancePlanActivity } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string; planId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, planId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionMaintenancePlanActivity(body)) {
    return NextResponse.json({ error: "Invalid maintenance plan update" }, { status: 400 });
  }
  const update = await prisma.productionMaintenancePlan.updateMany({
    where: { id: planId, organizationId },
    data: { active: body.active },
  });
  if (!update.count) {
    return NextResponse.json({ error: "Maintenance plan not found" }, { status: 404 });
  }
  return NextResponse.json(
    { plan: { id: planId, active: body.active } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
