import {
  getApplicationUrl,
  hasPremiumSubscriptionAccess,
  PREMIUM_TRIAL_DAYS,
} from "@/lib/billing";
import { getEmailPreferencesUrl } from "@/lib/email-preferences";
import { prisma } from "@/lib/prisma";
import { sendResendEmail } from "@/lib/resend-email";
import type { Prisma } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const JOB_BATCH_SIZE = 100;
const JOB_CONCURRENCY = 5;

const nairobiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const emailDateFormatter = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "long",
  timeZone: "Africa/Nairobi",
});

const nairobiHourFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Nairobi",
});

function getNairobiDate(date: Date) {
  const parts = Object.fromEntries(
    nairobiDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function nairobiDayStart(date: string) {
  return new Date(`${date}T00:00:00+03:00`);
}

export function getTrialEmailJobs(userId: string, trialEndsAt: Date) {
  const endDate = getNairobiDate(trialEndsAt);
  return [
    {
      userId,
      kind: "trial-ending",
      dedupeKey: "trial-ending",
      scheduledAt: nairobiDayStart(addCalendarDays(endDate, -3)),
    },
    {
      userId,
      kind: "trial-end-promotion",
      dedupeKey: "trial-end-promotion",
      scheduledAt: nairobiDayStart(endDate),
    },
  ];
}

export async function backfillRecentTrialEmailJobs(now = new Date()) {
  const users = await prisma.user.findMany({
    where: {
      emailVerified: { not: null },
      trialEndsAt: {
        gte: new Date(now.getTime() - 2 * DAY_MS),
        lte: new Date(now.getTime() + PREMIUM_TRIAL_DAYS * DAY_MS),
      },
    },
    select: { id: true, trialEndsAt: true },
  });
  if (!users.length) return;

  await prisma.emailJob.createMany({
    data: users.flatMap((user) =>
      user.trialEndsAt
        ? getTrialEmailJobs(user.id, user.trialEndsAt)
        : [],
    ),
    skipDuplicates: true,
  });
}

type EmailJobWithRelations = Prisma.EmailJobGetPayload<{
  include: {
    user: { include: { subscriptions: true } };
    campaign: true;
  };
}>;

function hasCurrentPremiumAccess(user: EmailJobWithRelations["user"], now: Date) {
  return hasPremiumSubscriptionAccess(
    user.subscriptions,
    user.premiumAccessGranted,
    now,
  );
}

function isInCampaignAudience(
  job: EmailJobWithRelations,
  now: Date,
) {
  const { campaign, user } = job;
  if (!campaign || !user.marketingEmailsEnabled) return false;
  const premium = hasCurrentPremiumAccess(user, now);
  if (campaign.audience === "premium") return premium;
  return (
    campaign.audience === "free" &&
    !premium &&
    (!user.trialEndsAt || user.trialEndsAt <= now)
  );
}

async function sendJobEmail(job: EmailJobWithRelations, now: Date) {
  const { user } = job;
  if (!user.email || !user.emailVerified) return false;
  const accountUrl = new URL("/account", getApplicationUrl()).toString();

  if (job.kind === "trial-ending") {
    if (
      !user.trialEndsAt ||
      user.trialEndsAt <= now ||
      hasCurrentPremiumAccess(user, now)
    ) {
      return false;
    }

    await sendResendEmail({
      to: user.email,
      idempotencyKey: `email-job/${job.id}`,
      subject: "Your Premium trial ends in 3 days",
      heading: "Your trial is almost over",
      message: `Your 7-day Premium trial ends on ${emailDateFormatter.format(user.trialEndsAt)}. After it ends, your account returns to Free.`,
      action: { label: "Manage your plan", href: accountUrl },
    });
    return true;
  }

  if (job.kind === "trial-end-promotion") {
    const trialEndDay = user.trialEndsAt
      ? getNairobiDate(user.trialEndsAt)
      : null;
    if (
      !user.marketingEmailsEnabled ||
      !trialEndDay ||
      getNairobiDate(now) < trialEndDay ||
      now >= nairobiDayStart(addCalendarDays(trialEndDay, 2)) ||
      hasCurrentPremiumAccess(user, now)
    ) {
      return false;
    }

    await sendResendEmail({
      to: user.email,
      idempotencyKey: `email-job/${job.id}`,
      subject: "Your Premium trial ends today",
      heading: "Keep all your Premium tools",
      message: "Your 7-day Premium trial ends today, and your workspace will return to Free after it expires.\n\nPremium includes every packaging keyline, PDF/SVG/DXF exports, dimension markings, and carton colour options for $5 per month.",
      action: { label: "Subscribe to Premium", href: accountUrl },
      unsubscribeUrl: getEmailPreferencesUrl(user.id),
    });
    return true;
  }

  if (
    job.kind !== "campaign" ||
    !job.campaign ||
    !isInCampaignAudience(job, now)
  ) {
    return false;
  }

  await sendResendEmail({
    to: user.email,
    idempotencyKey: `email-job/${job.id}`,
    subject: job.campaign.subject,
    heading: job.campaign.heading,
    message: job.campaign.message,
    action: { label: "Open CartonLab", href: accountUrl },
    unsubscribeUrl: getEmailPreferencesUrl(user.id),
  });
  return true;
}

async function processEmailJob(job: EmailJobWithRelations, now: Date) {
  const staleClaim = new Date(now.getTime() - 15 * 60 * 1000);
  const claim = await prisma.emailJob.updateMany({
    where: {
      id: job.id,
      scheduledAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "sending", claimedAt: { lt: staleClaim } },
      ],
    },
    data: {
      status: "sending",
      claimedAt: now,
      attempts: { increment: 1 },
    },
  });
  if (!claim.count) return "skipped" as const;

  try {
    const sent = await sendJobEmail(job, now);
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: sent ? "sent" : "skipped",
        claimedAt: null,
        sentAt: sent ? new Date() : null,
      },
    });
    return sent ? ("sent" as const) : ("skipped" as const);
  } catch (error) {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: { status: "failed", claimedAt: null },
    });
    console.error(`CartonLab email job ${job.id} failed:`, error);
    return "failed" as const;
  }
}

export async function processEmailJobs(now = new Date()) {
  const nairobiHour = Number(nairobiHourFormatter.format(now));
  if (nairobiHour < 9 || nairobiHour >= 18) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const jobs = await prisma.emailJob.findMany({
    where: {
      scheduledAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: { in: ["pending", "failed"] } },
        {
          status: "sending",
          claimedAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) },
        },
      ],
    },
    include: {
      user: { include: { subscriptions: true } },
      campaign: true,
    },
    orderBy: { scheduledAt: "asc" },
    take: JOB_BATCH_SIZE,
  });
  const outcomes: Array<"sent" | "skipped" | "failed"> = [];
  for (let index = 0; index < jobs.length; index += JOB_CONCURRENCY) {
    const batch = jobs.slice(index, index + JOB_CONCURRENCY);
    outcomes.push(
      ...(await Promise.all(batch.map((job) => processEmailJob(job, now)))),
    );
  }

  return {
    processed: outcomes.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}
