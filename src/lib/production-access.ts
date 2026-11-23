import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
) {
  return prisma.productionOrganizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { organizationId: true, role: true },
  });
}

export async function getAuthorizedProductionJob(
  userId: string,
  jobId: string,
) {
  const job = await prisma.productionJob.findUnique({
    where: { id: jobId },
    select: { id: true, organizationId: true },
  });
  if (!job) return null;

  const membership = await getProductionOrganizationMembership(userId, job.organizationId);
  return membership ? { job, membership } : null;
}
