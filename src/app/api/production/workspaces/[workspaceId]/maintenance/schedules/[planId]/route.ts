import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionMaintenancePlanActivity } from "@/lib/production-maintenance-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string; planId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, planId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
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
    where: { id: planId, workspaceId },
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
