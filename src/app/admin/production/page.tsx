import { Suspense } from "react";
import Link from "next/link";
import { ProductionRole } from "@prisma/client";
import { requireAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import BrandLogo from "../../brand-logo";
import {
  createProductionOrganization,
  removeProductionOrganizationMembership,
  saveProductionOrganizationMembership,
} from "./actions";

type ProductionAdminPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const notices: Record<string, string> = {
  "organization-created": "Production organization created.",
  "organization-membership-saved": "Organization membership saved.",
  "organization-membership-removed": "Organization member removed.",
};

const errors: Record<string, string> = {
  "invalid-email": "Enter a valid email address.",
  "organization-not-found": "The selected organization was not found.",
  "verified-user-required": "That email must belong to a registered, verified account.",
};

export default function ProductionAdminPage(props: ProductionAdminPageProps) {
  return (
    <Suspense
      fallback={
        <main className="account-page admin-page" aria-busy="true">
          <div className="admin-content">Loading production access…</div>
        </main>
      }
    >
      <ProductionAdminDashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ProductionAdminDashboard({
  searchParams,
}: ProductionAdminPageProps) {
  await requireAdminUser();
  const params = await searchParams;
  const [organizations, notice, error] = await Promise.all([
    prisma.productionOrganization.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { jobs: true } },
      },
    }),
    Promise.resolve(typeof params.notice === "string" ? notices[params.notice] : undefined),
    Promise.resolve(typeof params.error === "string" ? errors[params.error] : undefined),
  ]);

  return (
    <main className="account-page admin-page">
      <header className="account-header admin-header">
        <Link href="/" className="brand-lockup" aria-label="PackStudio home">
          <BrandLogo className="brand-wordmark" />
        </Link>
        <nav className="account-header-links" aria-label="Admin navigation">
          <Link href="/admin" className="account-back-link">Dashboard</Link>
          <Link href="/app" className="account-back-link">Studio</Link>
        </nav>
      </header>

      <section className="admin-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> PRODUCTION ACCESS</span>
          <h1>Organizations and roles</h1>
          <p>
            Create production organizations and assign verified accounts. Production
            members manage shared jobs; Order Bookers create orders, and Designers can
            view planned jobs and attach artwork.
          </p>
        </div>

        {notice && <p className="account-notice" role="status">{notice}</p>}
        {error && <p className="account-billing-unavailable" role="alert">{error}</p>}

        <section className="admin-panel" aria-labelledby="create-organization-heading">
          <div className="admin-panel-heading">
            <div>
              <span className="account-plan-kicker">ORGANIZATIONS</span>
              <h2 id="create-organization-heading">Create a production organization</h2>
            </div>
          </div>
          <form action={createProductionOrganization} className="admin-production-form">
            <label className="admin-production-field">
              <span>Organization name</span>
              <input name="name" maxLength={100} required />
            </label>
            <button className="button button-large" type="submit">Create organization</button>
          </form>
        </section>

        {organizations.map((organization) => (
          <section className="admin-panel" aria-labelledby={`organization-${organization.id}`} key={organization.id}>
            <div className="admin-panel-heading">
              <div>
                <span className="account-plan-kicker">PRODUCTION ORGANIZATION</span>
                <h2 id={`organization-${organization.id}`}>{organization.name}</h2>
              </div>
              <span>
                {organization.memberships.length} member{organization.memberships.length === 1 ? "" : "s"}
                {" · "}
                {organization._count.jobs} shared job{organization._count.jobs === 1 ? "" : "s"}
              </span>
            </div>

            <form action={saveProductionOrganizationMembership} className="admin-production-form">
              <input type="hidden" name="organizationId" value={organization.id} />
              <label className="admin-production-field">
                <span>Verified account email</span>
                <input name="email" type="email" maxLength={254} required />
              </label>
              <label className="admin-production-field">
                <span>Organization role</span>
                <select name="role" defaultValue={ProductionRole.PRODUCTION}>
                  <option value={ProductionRole.PRODUCTION}>Production</option>
                  <option value={ProductionRole.DESIGNER}>Designer</option>
                  <option value={ProductionRole.ORDER_BOOKER}>Order Booker</option>
                </select>
              </label>
              <button className="button button-large" type="submit">
                Add or update member
              </button>
            </form>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Role</th>
                    <th scope="col">Update role</th>
                    <th scope="col">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {organization.memberships.map((membership) => (
                    <tr key={membership.userId}>
                      <td>
                        {membership.user.name || membership.user.email || "Account"}
                        {membership.user.name && membership.user.email && (
                          <small>{membership.user.email}</small>
                        )}
                      </td>
                      <td>
                        {membership.role === ProductionRole.DESIGNER
                          ? "Designer"
                          : membership.role === ProductionRole.ORDER_BOOKER
                            ? "Order Booker"
                            : "Production"}
                      </td>
                      <td>
                        <form action={saveProductionOrganizationMembership} className="admin-production-inline-form">
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="email" value={membership.user.email ?? ""} />
                          <select
                            name="role"
                            defaultValue={membership.role}
                            aria-label={`Role for ${membership.user.email ?? "organization member"}`}
                          >
                            <option value={ProductionRole.PRODUCTION}>Production</option>
                            <option value={ProductionRole.DESIGNER}>Designer</option>
                            <option value={ProductionRole.ORDER_BOOKER}>Order Booker</option>
                          </select>
                          <button className="button button-small" type="submit">Save</button>
                        </form>
                      </td>
                      <td>
                        <form action={removeProductionOrganizationMembership}>
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="userId" value={membership.userId} />
                          <button className="admin-production-remove" type="submit">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {organization.memberships.length === 0 && (
                    <tr><td colSpan={4}>No members assigned yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {organizations.length === 0 && (
          <p className="admin-panel-note">No production organizations have been created.</p>
        )}
      </section>
    </main>
  );
}
