import { Suspense } from "react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import BrandLogo from "../../brand-logo";
import { createProductionOrganization } from "./actions";

type ProductionAdminPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const notices: Record<string, string> = {
  "organization-created": "Production organization created.",
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
  const [organizations, notice] = await Promise.all([
    prisma.productionOrganization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { jobs: true } },
      },
    }),
    Promise.resolve(typeof params.notice === "string" ? notices[params.notice] : undefined),
  ]);

  return (
    <main className="account-page admin-page">
      <header className="account-header admin-header">
        <Link href="/" className="brand-lockup" aria-label="PackStudio home">
          <BrandLogo className="brand-wordmark" />
        </Link>
        <nav className="account-header-links" aria-label="Admin navigation">
          <Link href="/admin" className="account-back-link">Dashboard</Link>
          <Link href="/admin/access-control" className="account-back-link">Access control</Link>
          <Link href="/app" className="account-back-link">Studio</Link>
        </nav>
      </header>

      <section className="admin-content">
        <div className="account-intro">
          <span className="eyebrow"><span /> PRODUCTION WORKSPACES</span>
          <h1>Production organizations</h1>
          <p>
            Create production organizations. Access is assigned globally through user
            roles in Access control; organizations no longer have separate memberships.
          </p>
        </div>

        {notice && <p className="account-notice" role="status">{notice}</p>}

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
              <span>{organization._count.jobs} shared job{organization._count.jobs === 1 ? "" : "s"}</span>
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
