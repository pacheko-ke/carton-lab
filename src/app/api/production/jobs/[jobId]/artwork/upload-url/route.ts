import { issueSignedToken, presignUrl } from "@vercel/blob";
import {
  canAttachProductionArtwork,
  getArtworkContentType,
  MAX_ARTWORK_FILE_BYTES,
  productionJobItemId,
  sanitizeArtworkFileName,
} from "@/lib/production-data";
import {
  getAuthorizedProductionJob,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { isPrivateBlobStorageConfigured } from "@/lib/blob-storage";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ jobId: string }> };

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
  const itemId = productionJobItemId(access.job.data);
  const existingArtwork = await prisma.productionAttachment.findFirst({
    where: { jobId },
    select: { id: true },
  });
  const item = itemId
    ? await prisma.productionItem.findFirst({
        where: { id: itemId, workspaceId: access.job.workspaceId },
        select: { id: true },
      })
    : null;
  const existingProductArtwork = !existingArtwork && item
    ? await prisma.productionAttachment.findUnique({
        where: { itemId: item.id },
        select: { id: true },
      })
    : null;
  if (existingArtwork || existingProductArtwork) {
    return NextResponse.json(
      { error: "Artwork is already attached to this job or product. Delete it first to replace it." },
      { status: 409 },
    );
  }
  if (!isPrivateBlobStorageConfigured()) {
    return NextResponse.json(
      { error: "Private Vercel Blob storage is not configured. Connect a private store or set BLOB_READ_WRITE_TOKEN." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const fileName = isUploadRequest(body) ? sanitizeArtworkFileName(body.fileName) : null;
  const contentType = fileName ? getArtworkContentType(fileName) : null;
  const fileSize = isUploadRequest(body) ? body.fileSize : NaN;
  if (!fileName || !contentType || !Number.isInteger(fileSize) || fileSize <= 0) {
    return NextResponse.json(
      { error: "Choose a supported artwork file" },
      { status: 400 },
    );
  }
  if (fileSize > MAX_ARTWORK_FILE_BYTES) {
    return NextResponse.json(
      { error: "Artwork files must be 5 MB or smaller" },
      { status: 413 },
    );
  }

  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension) {
    return NextResponse.json(
      { error: "Artwork file extension is required" },
      { status: 400 },
    );
  }
  const pathname = `production/${access.job.workspaceId}/${jobId}/${randomUUID()}.${extension}`;
  const validUntil = Date.now() + 5 * 60 * 1000;
  const token = await issueSignedToken({
    pathname,
    operations: ["put"],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_ARTWORK_FILE_BYTES,
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "put",
    pathname,
    access: "private",
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_ARTWORK_FILE_BYTES,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil,
  });

  return NextResponse.json(
    { pathname, presignedUrl, contentType },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function isUploadRequest(value: unknown): value is { fileName: string; fileSize: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "fileSize" in value &&
    typeof value.fileSize === "number"
  );
}
