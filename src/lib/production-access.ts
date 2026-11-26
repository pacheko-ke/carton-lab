import { auth } from "@/auth";
import {
  getProductionRoleCapabilities,
  getUserAccessSnapshot,
} from "@/lib/access-control";
import { isAdminEmail } from "@/lib/admin-email";
import { prisma } from "@/lib/prisma";

export const GLOBAL_PRODUCTION_WORKSPACE_ID = "global-production";

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

export async function getProductionWorkspaceMembership(
  userId: string,
  workspaceId: string,
  isAdmin = false,
) {
  if (workspaceId !== GLOBAL_PRODUCTION_WORKSPACE_ID) return null;
  const roles = isAdmin
    ? ["VIEWER", "PRODUCTION", "DESIGNER", "ORDER_BOOKER"]
    : await getProductionRoleCapabilities(userId);
  if (!roles.length) return null;
  return { workspaceId: GLOBAL_PRODUCTION_WORKSPACE_ID, role: roles.join("|") };
}

export async function getAuthorizedProductionJob(
  userId: string,
  jobId: string,
  isAdmin = false,
) {
  const job = await prisma.productionJob.findUnique({
    where: { id: jobId },
    select: { id: true, workspaceId: true, data: true },
  });
  if (!job) return null;

  const membership = await getProductionWorkspaceMembership(
    userId,
    job.workspaceId,
    isAdmin,
  );
  return membership ? { job, membership } : null;
}

export async function isProductionDesigner(userId: string): Promise<boolean> {
  return (await getProductionRoleCapabilities(userId)).includes("DESIGNER");
}
