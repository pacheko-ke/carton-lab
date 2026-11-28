import Link from "next/link";
import { redirect } from "next/navigation";
import BrandLogo from "@/app/brand-logo";
import SignOutButton from "@/app/sign-out-button";
import { requireVerifiedUser } from "@/lib/account";
import { canManageCompany, getCompanyMembership } from "@/lib/company";
import {
  getCompanyCountryOptions,
  getCompanyCurrencyOptions,
  getCompanyTimeZoneGroups,
} from "@/lib/company-options";
import { prisma } from "@/lib/prisma";
import {
  inviteCompanyMember,
  updateCompanyHrSettings,
  updateCompanyDetails,
} from "./actions";
import { formatProductionEmployeeNumber } from "@/lib/production-hr-data";

type CompanyPageProps = {
  searchParams?: Promise<{
    updated?: string | string[];
    invited?: string | string[];
    hrSettingsUpdated?: string | string[];
  }>;
  embedded?: boolean;
};

export default async function CompanyContent({
  searchParams,
  embedded,
}: CompanyPageProps) {
  const [user, params] = await Promise.all([
    requireVerifiedUser(),
    searchParams ??
      Promise.resolve<{
        updated?: string | string[];
        invited?: string | string[];
        hrSettingsUpdated?: string | string[];
      }>({}),
  ]);
  const membership = await getCompanyMembership(user.id);
  if (!membership) redirect("/production/admin?view=account");

  const canManage = canManageCompany(membership.role);
  const [members, invitations] = await Promise.all([
    prisma.companyMembership.findMany({
      where: { companyId: membership.companyId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    canManage
      ? prisma.companyInvitation.findMany({
          where: {
            companyId: membership.companyId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true, email: true, role: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const updated = params.updated === "1";
  const invited = params.invited === "1";
  const hrSettingsUpdated = params.hrSettingsUpdated === "1";
  const company = membership.company;
  const countryOptions = getCompanyCountryOptions(company.country);
  const timeZoneGroups = getCompanyTimeZoneGroups(company.timezone);
  const currencyOptions = getCompanyCurrencyOptions(company.currency);
  const CompanyShell = embedded ? "div" : "main";

  return (
    <CompanyShell
      className={`account-page${embedded ? " account-page-embedded account-page-embedded-company" : ""}`}
    >
      {!embedded && (
        <header className="account-header">
          <Link href="/" className="brand-lockup" aria-label="PackStudio home">
            <BrandLogo className="brand-wordmark" />
          </Link>
          <nav className="account-header-links" aria-label="Company navigation">
            <Link href="/app" className="account-back-link">Back to Studio</Link>
            <Link href="/production/admin?view=account" className="account-back-link">Account</Link>
            <SignOutButton />
          </nav>
        </header>
      )}
      <section className="account-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> COMPANY WORKSPACE</span>
          <h1>{company.name}</h1>
          <p>Company details and access for your PackStudio workspace.</p>
        </div>
        {updated && <p className="account-notice" role="status">Company details updated.</p>}
        {invited && <p className="account-notice" role="status">Invitation sent by email.</p>}
        {hrSettingsUpdated && <p className="account-notice" role="status">Company HR settings updated.</p>}

        <section className="account-profile-card company-details-card" aria-labelledby="company-details-heading">
          <div>
            <span className="account-plan-kicker">COMPANY DETAILS</span>
            <h2 id="company-details-heading">Business profile</h2>
          </div>
          {canManage ? (
            <form action={updateCompanyDetails} className="company-details-form">
              {embedded && <input name="embeddedDashboard" type="hidden" value="true" />}
              <label className="account-profile-field" htmlFor="company-name">
                Company name
                <input defaultValue={company.name} id="company-name" maxLength={120} name="name" required />
              </label>
              <label className="account-profile-field" htmlFor="company-country">
                Country
                <select defaultValue={company.country} id="company-country" name="country" required>
                  {countryOptions.map((country) => (
                    <option key={country.value} value={country.value}>{country.label}</option>
                  ))}
                </select>
              </label>
              <label className="account-profile-field" htmlFor="company-email">
                Company contact email
                <input defaultValue={company.contactEmail} id="company-email" maxLength={254} name="contactEmail" required type="email" />
              </label>
              <label className="account-profile-field" htmlFor="company-phone">
                Company phone
                <input defaultValue={company.contactPhone} id="company-phone" maxLength={40} name="contactPhone" type="tel" />
              </label>
              <label className="account-profile-field company-address-field" htmlFor="company-address">
                Address
                <textarea defaultValue={company.address} id="company-address" maxLength={300} name="address" rows={3} />
              </label>
              <label className="account-profile-field" htmlFor="company-timezone">
                Timezone
                <select defaultValue={company.timezone} id="company-timezone" name="timezone" required>
                  {timeZoneGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((timeZone) => (
                        <option key={timeZone.value} value={timeZone.value}>
                          {timeZone.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="account-profile-field" htmlFor="company-currency">
                Currency
                <select defaultValue={company.currency} id="company-currency" name="currency" required>
                  {currencyOptions.map((currency) => (
                    <option key={currency.value} value={currency.value}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="account-profile-field" htmlFor="company-logo">
                Company logo URL (optional)
                <input defaultValue={company.logoUrl ?? ""} id="company-logo" maxLength={2048} name="logoUrl" placeholder="https://example.com/logo.png" type="url" />
              </label>
              <button className="button button-large company-save-button" type="submit">Save company details</button>
            </form>
          ) : (
            <dl className="account-company-details">
              <div><dt>Country</dt><dd>{company.country}</dd></div>
              <div><dt>Contact email</dt><dd>{company.contactEmail}</dd></div>
              <div><dt>Phone</dt><dd>{company.contactPhone || "—"}</dd></div>
              <div><dt>Address</dt><dd>{company.address || "—"}</dd></div>
              <div><dt>Timezone</dt><dd>{company.timezone}</dd></div>
              <div><dt>Currency</dt><dd>{company.currency}</dd></div>
            </dl>
          )}
        </section>

        <section className="account-profile-card company-hr-settings-card" aria-labelledby="company-hr-settings-heading">
          <div>
            <span className="account-plan-kicker">HR CONFIGURATION</span>
            <h2 id="company-hr-settings-heading">Employee setup</h2>
            <p>Configure employee number sequencing and the options used by your employee register.</p>
          </div>
          {canManage ? (
            <form action={updateCompanyHrSettings} className="company-details-form company-hr-settings-form">
              {embedded && <input name="embeddedDashboard" type="hidden" value="true" />}
              <div className="account-profile-field company-employee-number-setting">
                Employee number format
                <span>Company prefix uses the first three letters of the company name.</span>
                <strong>{formatProductionEmployeeNumber(company.name, company.employeeNumberNext)}</strong>
              </div>
              <label className="account-profile-field" htmlFor="company-employee-number-next">
                Next employee number
                <span>Change this to control the next number assigned.</span>
                <input
                  id="company-employee-number-next"
                  max="2147483646"
                  min="1"
                  name="employeeNumberNext"
                  required
                  type="number"
                  defaultValue={company.employeeNumberNext}
                />
              </label>
              <label className="account-profile-field" htmlFor="company-hr-departments">
                Departments
                <span>Enter one department per line.</span>
                <textarea
                  id="company-hr-departments"
                  maxLength={8192}
                  name="hrDepartments"
                  rows={5}
                  defaultValue={company.hrDepartments.join("\n")}
                />
              </label>
              <label className="account-profile-field" htmlFor="company-hr-job-titles">
                Job titles
                <span>Enter one job title per line.</span>
                <textarea
                  id="company-hr-job-titles"
                  maxLength={8192}
                  name="hrJobTitles"
                  rows={5}
                  defaultValue={company.hrJobTitles.join("\n")}
                />
              </label>
              <label className="account-profile-field" htmlFor="company-hr-work-areas">
                Work areas
                <span>Enter one work area per line.</span>
                <textarea
                  id="company-hr-work-areas"
                  maxLength={8192}
                  name="hrWorkAreas"
                  rows={5}
                  defaultValue={company.hrWorkAreas.join("\n")}
                />
              </label>
              <button className="button button-large company-save-button" type="submit">Save HR settings</button>
            </form>
          ) : (
            <dl className="account-company-details">
              <div><dt>Next employee number</dt><dd>{formatProductionEmployeeNumber(company.name, company.employeeNumberNext)}</dd></div>
              <div><dt>Departments</dt><dd>{company.hrDepartments.join(", ") || "Not configured"}</dd></div>
              <div><dt>Job titles</dt><dd>{company.hrJobTitles.join(", ") || "Not configured"}</dd></div>
              <div><dt>Work areas</dt><dd>{company.hrWorkAreas.join(", ") || "Not configured"}</dd></div>
            </dl>
          )}
        </section>

        <section className="account-profile-card company-members-card" aria-labelledby="company-members-heading">
          <div>
            <span className="account-plan-kicker">TEAM ACCESS</span>
            <h2 id="company-members-heading">Company members</h2>
          </div>
          <ul className="account-company-member-list company-member-list">
            {members.map((entry) => (
              <li key={entry.id}>
                <span>{entry.user.name || entry.user.email || "Company member"}</span>
                <span>{entry.user.email || ""}</span>
                <strong>{entry.role}</strong>
              </li>
            ))}
          </ul>
          {canManage && (
            <>
              <form action={inviteCompanyMember} className="company-invite-form">
                {embedded && <input name="embeddedDashboard" type="hidden" value="true" />}
                <label className="account-profile-field" htmlFor="invite-email">
                  Invite by email
                  <input autoComplete="email" id="invite-email" maxLength={254} name="email" required type="email" />
                </label>
                <label className="account-profile-field" htmlFor="invite-role">
                  Company role
                  <select defaultValue="MEMBER" id="invite-role" name="role">
                    <option value="MEMBER">Member</option>
                    {membership.role === "OWNER" && <option value="ADMIN">Admin</option>}
                  </select>
                </label>
                <button className="button button-large company-invite-submit" type="submit">Send invitation</button>
              </form>
              {invitations.length > 0 && (
                <div className="company-pending-invitations">
                  <h3>Pending invitations</h3>
                  <ul className="account-company-member-list company-member-list">
                    {invitations.map((invitation) => (
                      <li key={invitation.id}>
                        <span>{invitation.email}</span>
                        <span>Expires {invitation.expiresAt.toLocaleDateString()}</span>
                        <strong>{invitation.role}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </CompanyShell>
  );
}
