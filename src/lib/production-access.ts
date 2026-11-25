import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  isProductionOriginationQueueStage,
  isProductionWorkflowStage,
  isRecord,
} from "@/lib/production-data";
import { prisma } from "@/lib/prisma";

export function isProductionAdmin(user: { email?: string | null }) {
  return isAdminEmail(user.email);
}

export async function getVerifiedProductionUser() {
  const session = await auth();
  if (!session?.user.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, emailVerified: true },
  });

  return user?.emailVerified ? user : null;
}

export async function getProductionOrganizationMembership(
  userId: string,
  organizationId: string,
  isAdmin = false,
) {
  if (isAdmin) {
    const organization = await prisma.productionOrganization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    return organization
      ? { organizationId: organization.id, role: "PRODUCTION" }
      : null;
  }

  const membership = await prisma.productionOrganizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { organizationId: true, role: true },
  });
  if (!membership || membership.role === "DESIGNER") return null;
  if (await isProductionDesigner(userId)) return null;

  return membership;
}

export async function getAuthorizedProductionJob(
  userId: string,
  jobId: string,
  isAdmin = false,
) {
  const job = await prisma.productionJob.findUnique({
    where: { id: jobId },
    select: { id: true, organizationId: true, data: true },
  });
  if (!job) return null;

  const membership = await getProductionOrganizationMembership(
    userId,
    job.organizationId,
    isAdmin,
  );
  if (membership) return { job, membership };

  const designerMembership = await prisma.productionOrganizationMembership.findFirst({
    where: { userId, role: "DESIGNER" },
    select: { userId: true },
  });
  const workflowStage =
    isRecord(job.data) && isProductionWorkflowStage(job.data.workflowStage)
      ? job.data.workflowStage
      : "Origination";
  if (!designerMembership || !isProductionOriginationQueueStage(workflowStage)) {
    return null;
  }

  return {
    job,
    membership: { organizationId: job.organizationId, role: "DESIGNER" },
  };
}

export async function isProductionDesigner(userId: string): Promise<boolean> {
  const membership = await prisma.productionOrganizationMembership.findFirst({
    where: { userId, role: "DESIGNER" },
    select: { userId: true },
  });
  return Boolean(membership);
}
