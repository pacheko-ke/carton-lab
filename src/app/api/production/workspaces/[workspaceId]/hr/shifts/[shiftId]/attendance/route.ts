import { Prisma } from "@prisma/client";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  validateProductionAttendance,
  validateProductionAttendanceClose,
} from "@/lib/production-hr-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; shiftId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { workspaceId, shiftId } = await params;
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
  if (!validateProductionAttendance(body)) {
    return NextResponse.json({ error: "Invalid attendance details" }, { status: 400 });
  }
  const clockedInAt = new Date(body.clockedInAt);
  const clockedOutAt = body.clockedOutAt ? new Date(body.clockedOutAt) : null;
  const now = new Date();
  if (clockedInAt > now || (clockedOutAt && clockedOutAt > now)) {
    return NextResponse.json({ error: "Attendance times cannot be in the future." }, { status: 400 });
  }
  try {
    const attendance = await prisma.$transaction(async (transaction) => {
      const shift = await transaction.productionRosterShift.findFirst({
        where: { id: shiftId, workspaceId, status: "PLANNED" },
        select: { id: true },
      });
      if (!shift) return { kind: "shift_unavailable" } as const;
      const existing = await transaction.productionAttendance.findUnique({
        where: { rosterShiftId: shift.id },
        select: { id: true },
      });
      if (existing) return { kind: "already_recorded" } as const;
      const saved = await transaction.productionAttendance.create({
        data: {
          workspaceId,
          rosterShiftId: shift.id,
          createdByUserId: user.id,
          clockedInAt,
          clockedOutAt,
          overtimeMinutes: Number(body.overtimeMinutes),
          notes: body.notes.trim(),
        },
        select: {
          id: true,
          clockedInAt: true,
          clockedOutAt: true,
          overtimeMinutes: true,
        },
      });
      await transaction.productionRosterShift.update({
        where: { id: shift.id },
        data: { status: "ATTENDED" },
      });
      return { kind: "created", attendance: saved } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (attendance.kind === "shift_unavailable") {
      return NextResponse.json({ error: "Roster shift not found or no longer active." }, { status: 404 });
    }
    if (attendance.kind === "already_recorded") {
      return NextResponse.json({ error: "Attendance has already been recorded for this shift." }, { status: 409 });
    }
    return NextResponse.json(
      { attendance: attendance.attendance },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "This shift was updated concurrently. Refresh and retry." }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  const { workspaceId, shiftId } = await params;
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
  if (!validateProductionAttendanceClose(body)) {
    return NextResponse.json({ error: "Invalid clock-out details" }, { status: 400 });
  }
  const clockedOutAt = new Date(body.clockedOutAt);
  if (clockedOutAt > new Date()) {
    return NextResponse.json({ error: "Clock-out time cannot be in the future." }, { status: 400 });
  }
  const shift = await prisma.productionRosterShift.findFirst({
    where: { id: shiftId, workspaceId },
    select: { attendance: { select: { id: true, clockedInAt: true, clockedOutAt: true } } },
  });
  if (!shift?.attendance) {
    return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  }
  if (shift.attendance.clockedOutAt) {
    return NextResponse.json({ error: "This attendance record is already closed." }, { status: 409 });
  }
  if (clockedOutAt < shift.attendance.clockedInAt) {
    return NextResponse.json({ error: "Clock-out must be after clock-in." }, { status: 400 });
  }
  const update = await prisma.productionAttendance.updateMany({
    where: { id: shift.attendance.id, workspaceId, clockedOutAt: null },
    data: {
      clockedOutAt,
      overtimeMinutes: Number(body.overtimeMinutes),
      notes: body.notes.trim(),
    },
  });
  if (!update.count) {
    return NextResponse.json({ error: "This attendance record was updated concurrently." }, { status: 409 });
  }
  const attendance = await prisma.productionAttendance.findUniqueOrThrow({
    where: { id: shift.attendance.id },
    select: { clockedInAt: true, clockedOutAt: true, overtimeMinutes: true, notes: true },
  });
  return NextResponse.json(
    { attendance },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
