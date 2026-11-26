import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { hasAccessPermission } from "@/lib/access-control";
import {
  calculateKenyanPayroll,
  isValidPayrollPeriod,
  KENYAN_PAYROLL_RULES,
} from "@/lib/production-payroll";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ workspaceId: string }> };

async function authorizePayroll(userId: string, workspaceId: string) {
  const membership = await getProductionWorkspaceMembership(userId, workspaceId);
  if (!membership) return "workspace" as const;
  return await hasAccessPermission(userId, "production.payroll.manage")
    ? "allowed" as const
    : "permission" as const;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const authorization = await authorizePayroll(user.id, workspaceId);
  if (authorization !== "allowed") {
    return NextResponse.json(
      { error: authorization === "workspace" ? "Workspace access denied" : "Payroll permission required" },
      { status: 403 },
    );
  }

  const [employees, runs] = await Promise.all([
    prisma.productionEmployee.findMany({
      where: { workspaceId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 1000,
      select: {
        id: true,
        employeeNo: true,
        name: true,
        department: true,
        status: true,
        monthlyBasicSalary: true,
        monthlyTaxableAllowances: true,
        payrollConfiguredAt: true,
      },
    }),
    prisma.productionPayrollRun.findMany({
      where: { workspaceId },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: {
        id: true,
        period: true,
        rulesVersion: true,
        createdAt: true,
        lines: {
          orderBy: [{ employeeName: "asc" }],
          select: {
            id: true,
            employeeNo: true,
            employeeName: true,
            department: true,
            basicSalary: true,
            taxableAllowances: true,
            grossPay: true,
            nssfEmployee: true,
            nssfEmployer: true,
            shif: true,
            housingLevyEmployee: true,
            housingLevyEmployer: true,
            taxablePay: true,
            paye: true,
            netPay: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      employees: employees.map(({ payrollConfiguredAt, ...employee }) => ({
        ...employee,
        payrollConfigured: payrollConfiguredAt !== null,
      })),
      runs,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const authorization = await authorizePayroll(user.id, workspaceId);
  if (authorization !== "allowed") {
    return NextResponse.json(
      { error: authorization === "workspace" ? "Workspace access denied" : "Payroll permission required" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("period" in body) ||
    !isValidPayrollPeriod(body.period)
  ) {
    return NextResponse.json({ error: "Enter a valid payroll month." }, { status: 400 });
  }

  const employees = await prisma.productionEmployee.findMany({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: [{ name: "asc" }],
    take: 1000,
    select: {
      id: true,
      employeeNo: true,
      name: true,
      department: true,
      monthlyBasicSalary: true,
      monthlyTaxableAllowances: true,
      payrollConfiguredAt: true,
    },
  });
  if (!employees.length) {
    return NextResponse.json(
      { error: "Add at least one active employee before generating payroll." },
      { status: 400 },
    );
  }
  const employeeWithoutCompensation = employees.find(
    (employee) => employee.payrollConfiguredAt === null,
  );
  if (employeeWithoutCompensation) {
    return NextResponse.json(
      {
        error: `Set and save compensation for ${employeeWithoutCompensation.employeeNo} before generating payroll.`,
      },
      { status: 400 },
    );
  }
  const employeeBelowShifMinimum = employees.find((employee) => {
    const grossPay = employee.monthlyBasicSalary + employee.monthlyTaxableAllowances;
    return grossPay > 0 && grossPay < KENYAN_PAYROLL_RULES.shif.minimum;
  });
  if (employeeBelowShifMinimum) {
    return NextResponse.json(
      {
        error: `${employeeBelowShifMinimum.employeeNo} has gross pay below the KES ${KENYAN_PAYROLL_RULES.shif.minimum} SHIF minimum. Set pay to zero or at least the minimum before generating payroll.`,
      },
      { status: 400 },
    );
  }

  const lines = employees.map((employee) => ({
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.name,
    department: employee.department,
    ...calculateKenyanPayroll({
      basicSalary: employee.monthlyBasicSalary,
      taxableAllowances: employee.monthlyTaxableAllowances,
    }),
  }));
  const statutoryRules = JSON.parse(
    JSON.stringify(KENYAN_PAYROLL_RULES),
  ) as Prisma.InputJsonValue;

  try {
    const payrollRun = await prisma.productionPayrollRun.create({
      data: {
        workspaceId,
        period: body.period,
        createdByUserId: user.id,
        rulesVersion: KENYAN_PAYROLL_RULES.version,
        statutoryRules,
        lines: { create: lines },
      },
      select: { id: true, period: true, createdAt: true },
    });
    return NextResponse.json(
      { payrollRun },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A payroll run already exists for that month." },
        { status: 409 },
      );
    }
    throw error;
  }
}
