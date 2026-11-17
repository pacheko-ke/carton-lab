import { MPESA_PROVIDER_PLAN_ID } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type EmailCampaignInput = {
  audience: "premium" | "free";
  subject: string;
  heading: string;
  message: string;
  createdByUserId: string;
};

function activeSubscriptionWhere(now: Date): Prisma.SubscriptionWhereInput {
  const planIds = [
    process.env.PAYSTACK_PLAN_CODE,
    MPESA_PROVIDER_PLAN_ID,
  ].filter((planId): planId is string => Boolean(planId));

  return {
    providerPlanId: { in: planIds },
    currentPeriodEnd: { gt: now },
    OR: [
      { status: "active" },
      { status: "cancelled", cancelAtPeriodEnd: true },
    ],
  };
}

function campaignAudienceWhere(
  audience: EmailCampaignInput["audience"],
  now: Date,
): Prisma.UserWhereInput {
  const activeSubscription = activeSubscriptionWhere(now);
  return audience === "premium"
    ? {
        OR: [
          { premiumAccessGranted: true },
          { subscriptions: { some: activeSubscription } },
        ],
      }
    : {
        premiumAccessGranted: false,
        OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }],
        subscriptions: { none: activeSubscription },
      };
}

function campaignRecipientWhere(
  audience: EmailCampaignInput["audience"],
  now: Date,
): Prisma.UserWhereInput {
  return {
    ...campaignAudienceWhere(audience, now),
    emailVerified: { not: null },
    email: { not: null },
    marketingEmailsEnabled: true,
  };
}

export async function getEmailCampaignAudienceCounts() {
  const now = new Date();
  const [premiumEligible, freeEligible] = await Promise.all([
    prisma.user.count({ where: campaignRecipientWhere("premium", now) }),
    prisma.user.count({ where: campaignRecipientWhere("free", now) }),
  ]);
  return {
    premium: { eligible: premiumEligible },
    free: { eligible: freeEligible },
  };
}

export async function queueEmailCampaign(input: EmailCampaignInput) {
  const now = new Date();
  const recipients = await prisma.user.findMany({
    where: campaignRecipientWhere(input.audience, now),
    select: { id: true },
  });
  if (!recipients.length) return 0;

  await prisma.$transaction(async (transaction) => {
    const campaign = await transaction.emailCampaign.create({
      data: {
        audience: input.audience,
        subject: input.subject,
        heading: input.heading,
        message: input.message,
        createdByUserId: input.createdByUserId,
      },
    });
    await transaction.emailJob.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        campaignId: campaign.id,
        kind: "campaign",
        dedupeKey: `campaign:${campaign.id}`,
        scheduledAt: now,
      })),
    });
  });

  return recipients.length;
}
