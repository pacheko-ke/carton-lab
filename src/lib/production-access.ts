import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
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

  return prisma.productionOrganizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { organizationId: true, role: true },
  });
}

export async function getAuthorizedProductionJob(
  userId: string,
  jobId: string,
  isAdmin = false,
) {
  const job = await prisma.productionJob.findUnique({
    where: { id: jobId },
    select: { id: true, organizationId: true },
  });
  if (!job) return null;

  const membership = await getProductionOrganizationMembership(
    userId,
    job.organizationId,
    isAdmin,
  );
  return membership ? { job, membership } : null;
}
