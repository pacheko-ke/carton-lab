import { isRecord } from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import { sendNotification, setVapidDetails } from "web-push";

type NewProductionJob = {
  id: string;
  organizationId: string;
  data: unknown;
};

export async function notifyOriginationOfNewJob(job: NewProductionJob) {
  const designers = await prisma.productionOrganizationMembership.findMany({
    where: { organizationId: job.organizationId, role: "DESIGNER" },
    select: { userId: true },
  }).catch((error: unknown) => {
    console.error("Could not find Origination notification recipients.", error);
    return null;
  });
  if (!designers?.length) return;

  const data = isRecord(job.data) ? job.data : {};
  const jobNo = typeof data.jobNo === "string" ? data.jobNo : job.id;
  const jobName = typeof data.jobName === "string" ? data.jobName : "New job";
  const message = `${jobName} (${jobNo}) is ready for Origination.`;
  const href = `/production/admin?jobId=${encodeURIComponent(job.id)}`;

  const notificationRows = designers.map(({ userId }) => ({
    userId,
    organizationId: job.organizationId,
    jobId: job.id,
    jobNo,
    title: "New job sheet for Origination",
    message,
    href,
  }));
  const persisted = await prisma.productionNotification.createMany({
    data: notificationRows,
    skipDuplicates: true,
  }).catch((error: unknown) => {
    console.error("Could not save Origination notifications.", error);
    return null;
  });
  if (!persisted) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;

  try {
    setVapidDetails(subject, publicKey, privateKey);
  } catch (error) {
    console.error("Web Push VAPID configuration is invalid.", error);
    return;
  }

  const subscriptions = await prisma.productionPushSubscription.findMany({
    where: { userId: { in: designers.map(({ userId }) => userId) } },
    select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
  }).catch((error: unknown) => {
    console.error("Could not load Origination push subscriptions.", error);
    return null;
  });
  if (!subscriptions?.length) return;

  const payload = JSON.stringify({
    title: "New job sheet for Origination",
    body: message,
    url: href,
    tag: `production-job-${job.id}`,
  });
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    } catch (error) {
      const statusCode = isRecord(error) && typeof error.statusCode === "number"
        ? error.statusCode
        : null;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.productionPushSubscription.deleteMany({
          where: { id: subscription.id, userId: subscription.userId },
        }).catch((deleteError: unknown) => {
          console.error("Could not remove an expired push subscription.", deleteError);
        });
        return;
      }
      console.error("Could not send an Origination push notification.", error);
    }
  }));
}
