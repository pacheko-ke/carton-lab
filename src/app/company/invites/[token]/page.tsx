import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import BrandLogo from "@/app/brand-logo";
import SignOutButton from "@/app/sign-out-button";
import { requireVerifiedUser } from "@/lib/account";
import { getCompanyMembership } from "@/lib/company";
import { normalizeEmail } from "@/lib/email-otp";
import { prisma } from "@/lib/prisma";
import { acceptCompanyInvitation } from "../../actions";

type InvitationPageProps = {
  params: Promise<{ token: string }>;
};

export default async function CompanyInvitationPage({ params }: InvitationPageProps) {
  const { token } = await params;
  const callbackUrl = `/company/invites/${encodeURIComponent(token)}`;
  const session = await auth();
  if (!session?.user.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  const user = await requireVerifiedUser();
  const invitation = await prisma.companyInvitation.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { company: { select: { name: true } } },
  });
  const alreadyMember = await getCompanyMembership(user.id);
  const isValid = Boolean(
    invitation &&
      !invitation.acceptedAt &&
      invitation.expiresAt > new Date() &&
      user.email &&
      normalizeEmail(user.email) === invitation.email,
  );

  return (
    <main className="account-page">
      <header className="account-header">
        <Link href="/" className="brand-lockup" aria-label="PackStudio home">
          <BrandLogo className="brand-wordmark" />
        </Link>
        <nav className="account-header-links" aria-label="Account navigation">
          <SignOutButton />
        </nav>
      </header>
      <section className="account-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> COMPANY INVITATION</span>
          <h1>Join a company workspace</h1>
          {isValid && invitation ? (
            <p>
              {invitation.company.name} invited {user.email} to join as a{" "}
              {invitation.role.toLowerCase()}.
            </p>
          ) : (
            <p>This invitation is invalid, expired, or addressed to another email.</p>
          )}
        </div>
        <section className="account-profile-card">
          {alreadyMember ? (
            <p>This account already belongs to a company. Sign in with an account that can accept this invitation.</p>
          ) : isValid ? (
            <form action={acceptCompanyInvitation.bind(null, token)}>
              <button className="button button-large" type="submit">Accept invitation</button>
            </form>
          ) : (
            <Link className="button button-large" href="/account">Return to account</Link>
          )}
        </section>
      </section>
    </main>
  );
}
