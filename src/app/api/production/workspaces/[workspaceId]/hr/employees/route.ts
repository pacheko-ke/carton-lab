import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  formatProductionEmployeeNumber,
  validateProductionEmployee,
} from "@/lib/production-hr-data";
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
      machineId: true,
      workArea: true,
      status: true,
      hiredAt: true,
      machine: { select: { machineNo: true, name: true } },
    },
  });
  return NextResponse.json(
    {
      employees: employees.map(({ machine, ...employee }) => ({
        ...employee,
        machineLabel: machine ? `${machine.machineNo} · ${machine.name}` : "",
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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
    const result = await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({
        where: { id: workspaceId },
        select: {
          name: true,
          hrDepartments: true,
          hrJobTitles: true,
          hrWorkAreas: true,
        },
      });
      if (!company) return { error: "Company workspace not found." } as const;
      if (
        !company.hrDepartments.includes(body.department) ||
        !company.hrJobTitles.includes(body.jobTitle) ||
        !company.hrWorkAreas.includes(body.workArea)
      ) {
        return { error: "Choose department, job title, and work area options configured by the company." } as const;
      }

      if (body.machineId) {
        const machine = await transaction.productionMachine.findFirst({
          where: { id: body.machineId, workspaceId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!machine) return { error: "Choose an active machine from this workspace." } as const;
      }

      const reservedSequence = await transaction.company.update({
        where: { id: workspaceId },
        data: { employeeNumberNext: { increment: 1 } },
        select: { name: true, employeeNumberNext: true },
      });
      const employeeNo = formatProductionEmployeeNumber(
        reservedSequence.name,
        reservedSequence.employeeNumberNext - 1,
      );
      const employee = await transaction.productionEmployee.create({
        data: {
          workspaceId,
          createdByUserId: user.id,
          employeeNo,
          name: body.name.trim(),
          nationalId: body.nationalId.trim(),
          dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
          address: body.address.trim(),
          nextOfKinName: body.nextOfKinName.trim(),
          nextOfKinRelationship: body.nextOfKinRelationship.trim(),
          nextOfKinPhone: body.nextOfKinPhone.trim(),
          department: body.department,
          jobTitle: body.jobTitle,
          machineId: body.machineId || null,
          workArea: body.workArea,
          hiredAt: new Date(`${body.hiredAt}T00:00:00.000Z`),
        },
        select: { id: true, employeeNo: true, name: true },
      });
      return { employee } as const;
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(
      { employee: result.employee },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "The National ID already exists or the employee sequence conflicts. Check company HR settings." },
        { status: 409 },
      );
    }
    throw error;
  }
}
