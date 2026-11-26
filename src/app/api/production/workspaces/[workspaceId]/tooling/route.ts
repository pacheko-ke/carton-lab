import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import { validateProductionTooling } from "@/lib/production-tooling-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ workspaceId: string }> };

async function getAccess(userId: string, workspaceId: string, isAdmin: boolean) {
  const membership = await getProductionWorkspaceMembership(userId, workspaceId, isAdmin);
  if (!membership) {
    return { response: NextResponse.json({ error: "Workspace access denied" }, { status: 403 }) };
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return { response: NextResponse.json({ error: "Production role required" }, { status: 403 }) };
  }
  return { membership };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const access = await getAccess(user.id, workspaceId, isProductionAdmin(user));
  if (access.response) return access.response;

  const tooling = await prisma.productionTooling.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { toolNo: "asc" }],
    take: 500,
    select: {
      id: true,
      workspaceId: true,
      toolNo: true,
      name: true,
      category: true,
      ownerType: true,
      customerId: true,
      storageLocation: true,
      status: true,
      usageCount: true,
      wearNotes: true,
      notes: true,
      updatedAt: true,
      customer: { select: { name: true } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          eventType: true,
          description: true,
          createdAt: true,
          jobId: true,
          job: { select: { data: true } },
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  return NextResponse.json(
    { tooling },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const access = await getAccess(user.id, workspaceId, isProductionAdmin(user));
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionTooling(body)) {
    return NextResponse.json({ error: "Invalid tooling details" }, { status: 400 });
  }
  if (body.ownerType === "CUSTOMER") {
    const customer = await prisma.productionCustomer.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
  }

  try {
    const tooling = await prisma.productionTooling.create({
      data: {
        workspaceId,
        createdByUserId: user.id,
        toolNo: body.toolNo.trim(),
        name: body.name.trim(),
        category: body.category,
        ownerType: body.ownerType,
        customerId: body.ownerType === "CUSTOMER" ? body.customerId : null,
        storageLocation: body.storageLocation.trim(),
        wearNotes: body.wearNotes.trim(),
        notes: body.notes.trim(),
      },
      select: { id: true, toolNo: true },
    });
    return NextResponse.json(
      { tooling },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A tooling record already uses that tool number." },
        { status: 409 },
      );
    }
    throw error;
  }
}
