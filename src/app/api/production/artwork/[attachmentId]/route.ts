import { get } from "@vercel/blob";
import { getProductionOrganizationMembership, getVerifiedProductionUser } from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ attachmentId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { attachmentId } = await params;
  const attachment = await prisma.productionAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      pathname: true,
      originalName: true,
      size: true,
      job: { select: { organizationId: true } },
    },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const membership = await getProductionOrganizationMembership(
    user.id,
    attachment.job.organizationId,
  );
  if (!membership) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const blob = await get(attachment.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const fallbackName = attachment.originalName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(attachment.originalName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return new NextResponse(blob.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(attachment.size),
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
