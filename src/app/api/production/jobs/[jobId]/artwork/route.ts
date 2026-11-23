import { get } from "@vercel/blob";
import { canAttachProductionArtwork, getArtworkContentType, MAX_ARTWORK_FILE_BYTES, sanitizeArtworkFileName } from "@/lib/production-data";
import {
  getAuthorizedProductionJob,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { jobId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getAuthorizedProductionJob(user.id, jobId, isAdmin);
  if (!access) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }

  const attachments = await prisma.productionAttachment.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      contentType: true,
      size: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    { attachments },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const { jobId } = await params;
  const isAdmin = isProductionAdmin(user);
  const access = await getAuthorizedProductionJob(user.id, jobId, isAdmin);
  if (!access) {
    return NextResponse.json({ error: "Production job not found" }, { status: 404 });
  }
  if (!isAdmin && !canAttachProductionArtwork(access.membership.role)) {
    return NextResponse.json(
      { error: "Designer role required to attach artwork" },
      { status: 403 },
    );
  }
  if (!process.env.BLOB_STORE_ID) {
    return NextResponse.json(
      { error: "Private Vercel Blob storage is not configured" },
      { status: 503 },
    );
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
    !("pathname" in body) ||
    typeof body.pathname !== "string" ||
    !("fileName" in body)
  ) {
    return NextResponse.json(
      { error: "Invalid artwork completion details" },
      { status: 400 },
    );
  }

  const fileName = sanitizeArtworkFileName(body.fileName);
  const contentType = fileName ? getArtworkContentType(fileName) : null;
  const expectedPrefix = `production/${access.job.organizationId}/${jobId}/`;
  if (
    !fileName ||
    !contentType ||
    !body.pathname.startsWith(expectedPrefix) ||
    !body.pathname.toLowerCase().endsWith(`.${fileName.toLowerCase().split(".").pop()}`)
  ) {
    return NextResponse.json(
      { error: "Artwork upload does not match this job" },
      { status: 400 },
    );
  }

  const blob = await get(body.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.blob.size || !blob.blob.contentType) {
    return NextResponse.json(
      { error: "Uploaded artwork could not be verified" },
      { status: 400 },
    );
  }
  if (blob.stream) await blob.stream.cancel();
  if (
    blob.blob.size > MAX_ARTWORK_FILE_BYTES ||
    blob.blob.contentType !== contentType
  ) {
    return NextResponse.json(
      { error: "Uploaded artwork failed file validation" },
      { status: 400 },
    );
  }

  const attachment = await prisma.productionAttachment.upsert({
    where: { pathname: body.pathname },
    create: {
      jobId,
      uploadedByUserId: user.id,
      pathname: body.pathname,
      originalName: fileName,
      contentType,
      size: blob.blob.size,
    },
    update: {},
    select: {
      id: true,
      originalName: true,
      contentType: true,
      size: true,
      createdAt: true,
      jobId: true,
    },
  });
  if (attachment.jobId !== jobId) {
    return NextResponse.json(
      { error: "Artwork is already attached to another job" },
      { status: 409 },
    );
  }

  return NextResponse.json({ attachment }, { status: 201 });
}
