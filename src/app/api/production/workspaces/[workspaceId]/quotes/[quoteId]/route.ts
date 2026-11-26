import { canBookProductionOrders, canEditProductionJobs } from "@/lib/production-data";
import { validateProductionQuoteAction } from "@/lib/production-quote-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string; quoteId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, quoteId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionQuoteAction(body)) {
    return NextResponse.json({ error: "Invalid quotation action" }, { status: 400 });
  }

  if (body.action === "SUBMIT") {
    if (
      !isAdmin &&
      !canBookProductionOrders(membership.role) &&
      !canEditProductionJobs(membership.role)
    ) {
      return NextResponse.json({ error: "Sales or Production access required" }, { status: 403 });
    }
  } else if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production access required for approval decisions" }, { status: 403 });
  }

  const now = new Date();
  const where = {
    id: quoteId,
    workspaceId,
    status: body.action === "SUBMIT" ? "DRAFT" : "SUBMITTED",
    ...(body.action !== "REJECT" ? { validUntil: { gte: now } } : {}),
  };
  const data = body.action === "SUBMIT"
    ? { status: "SUBMITTED", submittedAt: now, updatedByUserId: user.id }
    : body.action === "APPROVE"
      ? {
          status: "APPROVED",
          approvedAt: now,
          approvedByUserId: user.id,
          updatedByUserId: user.id,
          rejectionReason: "",
        }
      : {
          status: "REJECTED",
          rejectedAt: now,
          updatedByUserId: user.id,
          rejectionReason: body.reason.trim(),
        };
  const result = await prisma.productionQuote.updateMany({ where, data });
  if (result.count !== 1) {
    return NextResponse.json(
      { error: "The quote is expired or has changed state. Refresh and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
