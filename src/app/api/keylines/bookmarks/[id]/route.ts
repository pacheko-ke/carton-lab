import { auth } from "@/auth";
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

  const { id } = await params;
  const result = await prisma.keylineBookmark.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (!result.count) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
