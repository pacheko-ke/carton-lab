import { auth } from "@/auth";
import {
  getProductionRoleCapabilities,
  getUserAccessSnapshot,
} from "@/lib/access-control";
import { isAdminEmail } from "@/lib/admin-email";
import { prisma } from "@/lib/prisma";

export function isProductionAdmin(user: {
  email?: string | null;
  isSuperAdmin?: boolean;
}) {
  return user.isSuperAdmin === true || isAdminEmail(user.email);
}

export async function getVerifiedProductionUser() {
  const session = await auth();
  if (!session?.user.id) return null;

  const access = await getUserAccessSnapshot(session.user.id);
  if (!access?.user.emailVerified) return null;
  return {
    id: access.user.id,
    email: access.user.email,
    emailVerified: access.user.emailVerified,
    isSuperAdmin: access.isSuperAdmin,
  };
}

export async function getProductionOrganizationMembership(
  userId: string,
  organizationId: string,
  isAdmin = false,
) {
  const organization = await prisma.productionOrganization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) return null;
  const roles = isAdmin
    ? ["VIEWER", "PRODUCTION", "DESIGNER", "ORDER_BOOKER"]
    : await getProductionRoleCapabilities(userId);
  if (!roles.length) return null;
  return { organizationId: organization.id, role: roles.join("|") };
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
  return membership ? { job, membership } : null;
}

export async function isProductionDesigner(userId: string): Promise<boolean> {
  return (await getProductionRoleCapabilities(userId)).includes("DESIGNER");
}
