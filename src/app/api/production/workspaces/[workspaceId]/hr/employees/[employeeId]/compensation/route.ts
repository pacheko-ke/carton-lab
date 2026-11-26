import { NextResponse } from "next/server";
import { hasAccessPermission } from "@/lib/access-control";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
} from "@/lib/production-access";
import { isValidPayrollAmount } from "@/lib/production-payroll";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ workspaceId: string; employeeId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, employeeId } = await params;
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }
  if (!await hasAccessPermission(user.id, "production.payroll.manage")) {
    return NextResponse.json({ error: "Payroll permission required" }, { status: 403 });
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
    !("monthlyBasicSalary" in body) ||
    !("monthlyTaxableAllowances" in body) ||
    !isValidPayrollAmount(body.monthlyBasicSalary) ||
    !isValidPayrollAmount(body.monthlyTaxableAllowances)
  ) {
    return NextResponse.json(
      { error: "Enter non-negative whole-KES pay amounts." },
      { status: 400 },
    );
  }

  const result = await prisma.productionEmployee.updateMany({
    where: { id: employeeId, workspaceId },
    data: {
      monthlyBasicSalary: body.monthlyBasicSalary,
      monthlyTaxableAllowances: body.monthlyTaxableAllowances,
      payrollConfiguredAt: new Date(),
    },
  });
  if (!result.count) {
    return NextResponse.json({ error: "Employee not found in this workspace." }, { status: 404 });
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
