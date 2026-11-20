import { prisma } from "@/lib/prisma";

export const AUTH_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const SESSION_EXPIRY_GRACE_SECONDS = 5 * 60;

export function getAuthSessionExpiresAt(now = new Date()) {
  return new Date(
    now.getTime() +
      (AUTH_SESSION_MAX_AGE_SECONDS + SESSION_EXPIRY_GRACE_SECONDS) * 1000,
  );
}

export async function clearExpiredAuthSession(
  userId: string,
  activeSessionId: string,
  expiresAt: Date | null,
  now = new Date(),
) {
  if (expiresAt && expiresAt > now) return false;

  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      activeSessionId,
      activeSessionExpiresAt: expiresAt ? { lte: now } : null,
    },
    data: {
      activeSessionId: null,
      activeSessionExpiresAt: null,
    },
  });

  return result.count === 1;
}
