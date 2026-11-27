import { Prisma } from "@prisma/client";
import { del, get } from "@vercel/blob";
import {
  canAttachProductionArtwork,
  getArtworkContentType,
  MAX_ARTWORK_FILE_BYTES,
  MAX_ARTWORK_REVISION_COMMENT_LENGTH,
  productionJobItemId,
  sanitizeArtworkFileName,
} from "@/lib/production-data";
import {
  getAuthorizedProductionJob,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { prisma } from "@/lib/prisma";
import { isPrivateBlobStorageConfigured } from "@/lib/blob-storage";
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

  const itemId = productionJobItemId(access.job.data);
  const productAttachments = itemId
    ? await prisma.productionAttachment.findMany({
        where: { itemId },
        orderBy: { version: "desc" },
        select: {
          id: true,
          originalName: true,
          contentType: true,
          size: true,
          version: true,
          revisionComment: true,
          createdAt: true,
        },
      })
    : [];
  const jobAttachments = productAttachments.length
    ? []
    : await prisma.productionAttachment.findMany({
        where: { jobId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          originalName: true,
          contentType: true,
          size: true,
          version: true,
          revisionComment: true,
          createdAt: true,
        },
      });
  const attachments = productAttachments.length ? productAttachments : jobAttachments;

  return NextResponse.json(
    { attachments },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(_request: Request, { params }: RouteContext) {
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
      { error: "Designer role required to delete artwork" },
      { status: 403 },
    );
  }
  const itemId = productionJobItemId(access.job.data);
  if (
    itemId &&
    await prisma.productionAttachment.findFirst({
      where: { itemId },
      select: { id: true },
    })
  ) {
    return NextResponse.json(
      { error: "Artwork versions linked to this product are retained. Upload a new version instead of deleting them." },
      { status: 409 },
    );
  }
  const attachment = await prisma.productionAttachment.findFirst({
    where: { jobId, itemId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, pathname: true },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  if (!isPrivateBlobStorageConfigured()) {
    return NextResponse.json(
      { error: "Private Vercel Blob storage is not configured." },
      { status: 503 },
    );
  }

  try {
    await del(attachment.pathname);
  } catch (error) {
    console.error("Could not delete artwork from private blob storage.", error);
    return NextResponse.json(
      { error: "Could not delete artwork from storage. The attachment was left unchanged." },
      { status: 502 },
    );
  }

  try {
    const result = await prisma.productionAttachment.deleteMany({
      where: { id: attachment.id, jobId },
    });
    if (!result.count) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Could not remove the artwork record after deleting its blob.", error);
    return NextResponse.json(
      { error: "Artwork storage was deleted, but its record could not be removed. Retry the delete." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { deleted: true },
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

  const revisionComment = "revisionComment" in body ? body.revisionComment : "";
  if (
    typeof revisionComment !== "string" ||
    revisionComment.length > MAX_ARTWORK_REVISION_COMMENT_LENGTH
  ) {
    return NextResponse.json(
      { error: `Revision comments must be ${MAX_ARTWORK_REVISION_COMMENT_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const fileName = sanitizeArtworkFileName(body.fileName);
  const contentType = fileName ? getArtworkContentType(fileName) : null;
  const expectedPrefix = `production/${access.job.workspaceId}/${jobId}/`;
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

  const pathname = body.pathname;
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

  let result;
  try {
    result = await prisma.$transaction(async (transaction) => {
      const existingPath = await transaction.productionAttachment.findUnique({
        where: { pathname },
        select: {
          id: true,
          jobId: true,
          originalName: true,
          contentType: true,
          size: true,
          version: true,
          revisionComment: true,
          createdAt: true,
        },
      });
      if (existingPath) {
        return existingPath.jobId === jobId
          ? { attachment: existingPath, created: false as const }
          : { conflict: true as const };
      }

      const requestedItemId = productionJobItemId(access.job.data);
      const item = requestedItemId
        ? await transaction.productionItem.findFirst({
            where: {
              id: requestedItemId,
              workspaceId: access.job.workspaceId,
            },
            select: { id: true },
          })
        : null;
      if (!item) {
        const existingJobArtwork = await transaction.productionAttachment.findFirst({
          where: { jobId },
          select: { id: true },
        });
        if (existingJobArtwork) return { conflict: true as const };
      }
      const latestProductVersion = item
        ? await transaction.productionAttachment.findFirst({
            where: { itemId: item.id },
            orderBy: { version: "desc" },
            select: { version: true },
          })
        : null;

      const attachment = await transaction.productionAttachment.create({
        data: {
          jobId,
          itemId: item?.id ?? null,
          version: latestProductVersion ? latestProductVersion.version + 1 : 1,
          uploadedByUserId: user.id,
          pathname,
          originalName: fileName,
          contentType,
          size: blob.blob.size,
          revisionComment: revisionComment.trim(),
        },
        select: {
          id: true,
          jobId: true,
          originalName: true,
          contentType: true,
          size: true,
          version: true,
          revisionComment: true,
          createdAt: true,
        },
      });
      return { attachment, created: true as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      return NextResponse.json(
        { error: "Artwork upload conflicted with another upload. Please try again." },
        { status: 409 },
      );
    }
    throw error;
  }

  if ("conflict" in result) {
    return NextResponse.json(
      { error: "Artwork is already attached to this job. Delete it first to replace it." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { attachment: result.attachment },
    {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
