import { auth } from "@/auth";
import { hasPremiumAccess } from "@/lib/billing";
import { hasAccessPermission } from "@/lib/access-control";
import { createKeylineCatalog } from "@/lib/keyline-catalog";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const fieldIds = new Set([
  "boxType",
  "L",
  "W",
  "H",
  "unit",
  "ply",
  "crease",
  "bwadd",
  "glue",
  "slot",
  "showDetails",
  "dims",
  "prec",
  "color",
  "date",
  "job",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getVerifiedUser() {
  const session = await auth();
  if (!session?.user.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      emailVerified: true,
      premiumAccessGranted: true,
      trialEndsAt: true,
      subscriptions: true,
    },
  });

  return user?.emailVerified ? user : null;
}

export async function GET() {
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  if (!(await hasAccessPermission(user.id, "keylines.use"))) {
    return NextResponse.json({ error: "Keyline access is not assigned to this account" }, { status: 403 });
  }

  const bookmarks = await prisma.keylineBookmark.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keylineId: true,
      settings: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    { bookmarks },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  if (!(await hasAccessPermission(user.id, "keylines.use"))) {
    return NextResponse.json({ error: "Keyline access is not assigned to this account" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 80 ||
    typeof body.keylineId !== "string" ||
    !isRecord(body.settings) ||
    !isRecord(body.settings.fields) ||
    !isRecord(body.settings.kin) ||
    JSON.stringify(body.settings).length > 16_384
  ) {
    return NextResponse.json({ error: "Invalid bookmark details" }, { status: 400 });
  }

  const { fields, kin } = body.settings;
  if (
    fields.boxType !== body.keylineId ||
    Object.entries(fields).some(
      ([key, value]) =>
        !fieldIds.has(key) ||
        (key === "dims" || key === "showDetails"
          ? typeof value !== "boolean"
          : typeof value !== "string"),
    ) ||
    Object.entries(kin).some(
      ([keylineId, values]) =>
        keylineId.length > 120 ||
        !isRecord(values) ||
        Object.entries(values).some(
          ([inputId, value]) => inputId.length > 120 || typeof value !== "string",
        ),
    )
  ) {
    return NextResponse.json({ error: "Invalid bookmark settings" }, { status: 400 });
  }

  const premium = hasPremiumAccess(
    user.subscriptions,
    user.premiumAccessGranted,
    user.trialEndsAt,
  );
  const availableKeylines = createKeylineCatalog(premium).definitions;
  if (
    body.keylineId !== "rsc" &&
    !availableKeylines.some((definition) => definition.id === body.keylineId)
  ) {
    return NextResponse.json({ error: "This keyline is not available" }, { status: 403 });
  }

  const existing = await prisma.keylineBookmark.findFirst({
    where: { userId: user.id, keylineId: body.keylineId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This keyline is already bookmarked" },
      { status: 409 },
    );
  }

  try {
    const bookmark = await prisma.keylineBookmark.create({
      data: {
        userId: user.id,
        keylineId: body.keylineId,
        name: body.name.trim(),
        settings: body.settings as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        keylineId: true,
        settings: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ bookmark }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This keyline is already bookmarked" },
        { status: 409 },
      );
    }
    throw error;
  }
}
