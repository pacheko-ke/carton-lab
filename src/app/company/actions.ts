"use server";

import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireVerifiedUser } from "@/lib/account";
import { canManageCompany, getCompanyMembership } from "@/lib/company";
import { assignDefaultAccessRole } from "@/lib/access-control";
import { isValidEmail, normalizeEmail } from "@/lib/email-otp";
import { sendResendEmail } from "@/lib/resend-email";

const COMPANY_ACCESS_ROLE_IDS = [
  "access-role-production",
  "access-role-designer",
  "access-role-order-booker",
];

function readText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new Error(`Missing ${key} value.`);
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length > maxLength) {
    throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function companyFields(formData: FormData) {
  const name = readText(formData, "name", 120);
  const country = readText(formData, "country", 100);
  const contactEmail = normalizeEmail(readText(formData, "contactEmail", 254));
  const contactPhone = readText(formData, "contactPhone", 40);
  const address = readText(formData, "address", 300);
  const timezone = readText(formData, "timezone", 100);
  const currency = readText(formData, "currency", 3).toUpperCase();
  const logoUrl = readText(formData, "logoUrl", 2048);

  if (!name || !country || !isValidEmail(contactEmail)) {
    throw new Error("Company name, country, and a valid contact email are required.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a three-letter ISO currency code.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("Choose a valid timezone.");
  }
  if (logoUrl) {
    let parsedLogoUrl: URL;
    try {
      parsedLogoUrl = new URL(logoUrl);
    } catch {
      throw new Error("Company logo must be a valid HTTPS URL.");
    }
    if (parsedLogoUrl.protocol !== "https:") {
      throw new Error("Company logo must be a valid HTTPS URL.");
    }
  }

  return {
    name,
    country,
    contactEmail,
    contactPhone,
    address,
    timezone,
    currency,
    logoUrl: logoUrl || null,
  };
}

async function assignCompanyAccessRoles(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  await assignDefaultAccessRole(transaction, userId);
  for (const roleId of COMPANY_ACCESS_ROLE_IDS) {
    await transaction.userAccessRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }
}

export async function createCompany(formData: FormData) {
  const user = await requireVerifiedUser();
  if (await getCompanyMembership(user.id)) {
    redirect("/company");
  }

  const details = companyFields(formData);
  await prisma.$transaction(async (transaction) => {
    const company = await transaction.company.create({
      data: {
        ...details,
        premiumAccessGranted: user.premiumAccessGranted,
        trialEndsAt: user.trialEndsAt,
      },
    });
    await transaction.companyMembership.create({
      data: { companyId: company.id, userId: user.id, role: "OWNER" },
    });
    await assignCompanyAccessRoles(transaction, user.id);
    await transaction.subscription.updateMany({
      where: { userId: user.id, companyId: null },
      data: { companyId: company.id },
    });
    await transaction.billingCheckout.updateMany({
      where: { userId: user.id, companyId: null },
      data: { companyId: company.id },
    });
    await transaction.billingPayment.updateMany({
      where: { userId: user.id, companyId: null },
      data: { companyId: company.id },
    });
    await transaction.keylineBookmark.updateMany({
      where: { userId: user.id, companyId: null },
      data: { companyId: company.id },
    });
    await transaction.user.update({
      where: { id: user.id },
      data: { companyName: company.name },
    });
  });

  revalidatePath("/app");
  revalidatePath("/company");
  revalidatePath("/production/admin");
  redirect("/app");
}

export async function updateCompanyDetails(formData: FormData) {
  const user = await requireVerifiedUser();
  const membership = await getCompanyMembership(user.id);
  if (!membership || !canManageCompany(membership.role)) {
    throw new Error("Only company owners and admins can update company details.");
  }

  const details = companyFields(formData);
  await prisma.company.update({
    where: { id: membership.companyId },
    data: details,
  });
  await prisma.user.updateMany({
    where: { companyMembership: { is: { companyId: membership.companyId } } },
    data: { companyName: details.name },
  });

  revalidatePath("/company");
  revalidatePath("/app");
  revalidatePath("/production/admin");
  redirect("/company?updated=1");
}

export async function inviteCompanyMember(formData: FormData) {
  const user = await requireVerifiedUser();
  const membership = await getCompanyMembership(user.id);
  if (!membership || !canManageCompany(membership.role)) {
    throw new Error("Only company owners and admins can invite members.");
  }

  const email = normalizeEmail(readText(formData, "email", 254));
  const role = readText(formData, "role", 10);
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  if (role !== "ADMIN" && role !== "MEMBER") {
    throw new Error("Choose a valid company role.");
  }
  if (membership.role !== "OWNER" && role === "ADMIN") {
    throw new Error("Only the company owner can invite another admin.");
  }

  const invitedUser = await prisma.user.findUnique({
    where: { email },
    select: { companyMembership: { select: { companyId: true } } },
  });
  if (invitedUser?.companyMembership) {
    throw new Error("That user already belongs to a company.");
  }

  const pendingInvite = await prisma.companyInvitation.findFirst({
    where: {
      companyId: membership.companyId,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (pendingInvite) throw new Error("There is already a pending invitation for that email.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.companyInvitation.create({
    data: {
      companyId: membership.companyId,
      email,
      role,
      tokenHash,
      createdByUserId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });

  const baseUrl = process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    await prisma.companyInvitation.delete({ where: { id: invitation.id } });
    throw new Error("Configure AUTH_URL to send company invitations.");
  }

  try {
    await sendResendEmail({
      to: email,
      subject: `Join ${membership.company.name} on PackStudio`,
      heading: "You have been invited",
      message: `You have been invited to join ${membership.company.name} as a ${role.toLowerCase()}. This invitation expires in seven days.`,
      action: {
        label: "Accept invitation",
        href: new URL(`/company/invites/${token}`, baseUrl).toString(),
      },
    });
  } catch (error) {
    await prisma.companyInvitation.delete({ where: { id: invitation.id } });
    console.error("Could not send company invitation:", error);
    throw new Error("The invitation could not be emailed. Check the email configuration and try again.");
  }

  revalidatePath("/company");
  redirect("/company?invited=1");
}

export async function acceptCompanyInvitation(token: string) {
  const user = await requireVerifiedUser();
  if (!user.email) throw new Error("A verified email address is required to accept an invitation.");
  if (await getCompanyMembership(user.id)) {
    throw new Error("This account already belongs to a company.");
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.companyInvitation.findUnique({
    where: { tokenHash },
    include: { company: { select: { id: true, name: true } } },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date() ||
    normalizeEmail(user.email) !== invitation.email
  ) {
    throw new Error("This invitation is invalid, expired, or addressed to another email.");
  }

  await prisma.$transaction(async (transaction) => {
    const claim = await transaction.companyInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { acceptedAt: new Date() },
    });
    if (claim.count !== 1) throw new Error("This invitation has already been accepted or expired.");

    await transaction.companyMembership.create({
      data: {
        companyId: invitation.company.id,
        userId: user.id,
        role: invitation.role,
      },
    });
    await assignCompanyAccessRoles(transaction, user.id);
    await transaction.keylineBookmark.updateMany({
      where: { userId: user.id, companyId: null },
      data: { companyId: invitation.company.id },
    });
    await transaction.user.update({
      where: { id: user.id },
      data: { companyName: invitation.company.name },
    });
  });

  revalidatePath("/app");
  revalidatePath("/company");
  revalidatePath("/production/admin");
  redirect("/app");
}
