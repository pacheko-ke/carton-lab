import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  isProductionLeaveTransitionAllowed,
  validateProductionLeaveReview,
} from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; requestId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { organizationId, requestId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production role required" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionLeaveReview(body)) {
    return NextResponse.json({ error: "Invalid leave decision" }, { status: 400 });
  }
  const current = await prisma.productionLeaveRequest.findFirst({
    where: { id: requestId, organizationId },
    select: { id: true, status: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }
  if (!isProductionLeaveTransitionAllowed(current.status)) {
    return NextResponse.json({ error: "This leave request has already been reviewed." }, { status: 409 });
  }
  const update = await prisma.productionLeaveRequest.updateMany({
    where: { id: current.id, organizationId, status: "PENDING" },
    data: {
      status: body.status,
      reviewNotes: body.reviewNotes.trim(),
      reviewedByUserId: user.id,
      reviewedAt: new Date(),
    },
  });
  if (!update.count) {
    return NextResponse.json({ error: "This leave request has already been reviewed." }, { status: 409 });
  }
  return NextResponse.json(
    { leaveRequest: { id: requestId, status: body.status } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
