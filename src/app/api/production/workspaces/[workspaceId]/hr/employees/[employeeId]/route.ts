import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionEmployeeStatus } from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; employeeId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, employeeId } = await params;
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
  if (!validateProductionEmployeeStatus(body)) {
    return NextResponse.json({ error: "Invalid employee status" }, { status: 400 });
  }

  const result = await prisma.productionEmployee.updateMany({
    where: { id: employeeId, workspaceId },
    data: { status: body.status },
  });
  if (!result.count) {
    return NextResponse.json({ error: "Employee not found in this workspace." }, { status: 404 });
  }

  return NextResponse.json(
    { employee: { id: employeeId, status: body.status } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
