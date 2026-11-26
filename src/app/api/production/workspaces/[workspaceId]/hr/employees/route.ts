import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionEmployee } from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { workspaceId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }
  const employees = await prisma.productionEmployee.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 1000,
    select: {
      id: true,
      workspaceId: true,
      employeeNo: true,
      name: true,
      department: true,
      jobTitle: true,
      status: true,
      hiredAt: true,
    },
  });
  return NextResponse.json({ employees }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { workspaceId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionEmployee(body)) {
    return NextResponse.json({ error: "Invalid employee details" }, { status: 400 });
  }
  try {
    const employee = await prisma.productionEmployee.create({
      data: {
        workspaceId,
        createdByUserId: user.id,
        employeeNo: body.employeeNo.trim(),
        name: body.name.trim(),
        department: body.department.trim(),
        jobTitle: body.jobTitle.trim(),
        hiredAt: new Date(`${body.hiredAt}T00:00:00.000Z`),
      },
      select: { id: true, employeeNo: true, name: true },
    });
    return NextResponse.json({ employee }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That employee number is already in use." }, { status: 409 });
    }
    throw error;
  }
}
