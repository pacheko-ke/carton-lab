import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  canEditProductionJobs,
} from "@/lib/production-data";
import {
  validateProductionToolingUpdate,
} from "@/lib/production-tooling-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; toolingId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, toolingId } = await params;
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
  if (!validateProductionToolingUpdate(body)) {
    return NextResponse.json({ error: "Invalid tooling update" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (transaction) => {
    const current = await transaction.productionTooling.findFirst({
      where: { id: toolingId, organizationId },
      select: { id: true, status: true },
    });
    if (!current) return null;

    await transaction.productionTooling.update({
      where: { id: current.id },
      data: {
        status: body.status,
        storageLocation: body.storageLocation.trim(),
        wearNotes: body.wearNotes.trim(),
        notes: body.notes.trim(),
      },
    });
    if (current.status !== body.status) {
      await transaction.productionToolingEvent.create({
        data: {
          organizationId,
          toolingId: current.id,
          createdByUserId: user.id,
          eventType: "STATUS_CHANGE",
          description: `Status changed from ${current.status} to ${body.status}.`,
        },
      });
    }
    return { id: current.id, status: body.status };
  });
  if (!result) {
    return NextResponse.json({ error: "Tooling record not found" }, { status: 404 });
  }
  return NextResponse.json(
    { tooling: result },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
