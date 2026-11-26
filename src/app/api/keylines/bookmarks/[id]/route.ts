import { auth } from "@/auth";
import { hasAccessPermission } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasAccessPermission(session.user.id, "keylines.use"))) {
    return NextResponse.json({ error: "Keyline access is not assigned to this account" }, { status: 403 });
  }

  const { id } = await params;
  const result = await prisma.keylineBookmark.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (!result.count) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
