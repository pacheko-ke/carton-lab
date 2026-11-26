import { Suspense } from "react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/admin";
import {
  ACCESS_PERMISSION_GROUPS,
} from "@/lib/access-control";
import { isAdminEmail } from "@/lib/admin-email";
import { prisma } from "@/lib/prisma";
import BrandLogo from "../../brand-logo";
import SignOutButton from "@/app/sign-out-button";
import {
  assignAccessRole,
  createAccessRole,
  deleteAccessRole,
  removeAccessRole,
  updateAccessRole,
} from "./actions";

export default function AccessControlPage() {
  return (
    <Suspense
      fallback={
        <main className="account-page admin-page" aria-busy="true">
          <div className="admin-content">Loading access control…</div>
        </main>
      }
    >
      <AccessControlDashboard />
    </Suspense>
  );
}

async function AccessControlDashboard() {
  await requireAdminUser();
  const [roles, users] = await Promise.all([
    prisma.accessRole.findMany({
      orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
      include: { _count: { select: { assignments: true } } },
    }),
    prisma.user.findMany({
      where: { emailVerified: { not: null } },
      orderBy: { email: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        accessRoles: {
          select: {
            role: { select: { id: true, name: true, isSuperAdmin: true } },
          },
        },
      },
    }),
  ]);

  return (
    <main className="account-page admin-page">
      <header className="account-header admin-header">
        <Link href="/" className="brand-lockup" aria-label="PackStudio home">
          <BrandLogo className="brand-wordmark" />
        </Link>
        <nav className="account-header-links" aria-label="Account navigation">
          <SignOutButton />
        </nav>
      </header>

      <section className="admin-content access-control-layout">
        <aside className="access-control-sidebar">
          <nav aria-label="Access control navigation">
            <div className="access-control-nav-group">
              <span>Administration</span>
              <Link href="/admin">Dashboard</Link>
              <Link href="/admin/access-control" aria-current="page">
                Access control
              </Link>
            </div>
            <div className="access-control-nav-group">
              <span>On this page</span>
              <a href="#create-role">Create a role</a>
              <a href="#role-catalog">Role catalog</a>
              <a href="#user-access">User access</a>
            </div>
            <div className="access-control-nav-group">
              <span>Workspace</span>
              <Link href="/app">Studio</Link>
              <Link href="/production/admin">Production ERP</Link>
            </div>
          </nav>
        </aside>

        <div className="access-control-main">
          <div className="account-intro">
            <span className="eyebrow"><span /> GLOBAL ACCESS</span>
            <h1>Roles and permissions</h1>
            <p>
              Roles apply across the entire application, not per workspace.
              Permissions are additive when a user has multiple roles. Super admins
              have unrestricted access and can assign any role, including super admin.
            </p>
          </div>

        <section id="create-role" className="admin-panel" aria-labelledby="create-role-heading">
          <div className="admin-panel-heading">
            <div>
              <span className="account-plan-kicker">ROLE CATALOG</span>
              <h2 id="create-role-heading">Create a role</h2>
            </div>
          </div>
          <form action={createAccessRole} className="admin-production-form">
            <label className="admin-production-field">
              <span>Role name</span>
              <input name="name" maxLength={60} required />
            </label>
            <label className="admin-production-field">
              <span>Description</span>
              <input name="description" maxLength={180} />
            </label>
            {ACCESS_PERMISSION_GROUPS.map((group) => (
              <fieldset className="admin-access-permission-group" key={group.name}>
                <legend>{group.name}</legend>
                {group.permissions.map((permission) => (
                  <label className="admin-access-permission" key={permission.key}>
                    <input name="permission" type="checkbox" value={permission.key} />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="admin-access-permission">
              <input name="isSuperAdmin" type="checkbox" />
              <span>Grant unrestricted super-admin access</span>
            </label>
            <button className="button button-large" type="submit">Create role</button>
          </form>
        </section>

        <div id="role-catalog" className="access-control-role-list">
          <div className="access-control-section-heading">
            <span className="account-plan-kicker">GLOBAL ACCESS</span>
            <h2>Role catalog</h2>
          </div>
          {roles.map((role) => (
          <section className="admin-panel" aria-labelledby={`role-${role.id}`} key={role.id}>
            <div className="admin-panel-heading">
              <div>
                <span className="account-plan-kicker">
                  {role.isSuperAdmin ? "UNRESTRICTED ACCESS" : "GLOBAL ROLE"}
                </span>
                <h2 id={`role-${role.id}`}>{role.name}</h2>
              </div>
              <span>{role._count.assignments} assigned</span>
            </div>
            {role.isSuperAdmin ? (
              <p className="admin-panel-note">
                This role cannot be edited or deleted. Assign it only to trusted administrators.
              </p>
            ) : (
              <form action={updateAccessRole} className="admin-production-form">
                <input name="roleId" type="hidden" value={role.id} />
                <label className="admin-production-field">
                  <span>Role name</span>
                  <input name="name" defaultValue={role.name} maxLength={60} required />
                </label>
                <label className="admin-production-field">
                  <span>Description</span>
                  <input name="description" defaultValue={role.description} maxLength={180} />
                </label>
                {ACCESS_PERMISSION_GROUPS.map((group) => (
                  <fieldset className="admin-access-permission-group" key={group.name}>
                    <legend>{group.name}</legend>
                    {group.permissions.map((permission) => (
                      <label className="admin-access-permission" key={permission.key}>
                        <input
                          name="permission"
                          type="checkbox"
                          value={permission.key}
                          defaultChecked={role.permissions.includes(permission.key)}
                        />
                        <span>{permission.label}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button className="button button-large" type="submit">Save role</button>
              </form>
            )}
            {!role.isSystem && !role.isSuperAdmin && (
              <form action={deleteAccessRole}>
                <input name="roleId" type="hidden" value={role.id} />
                <button
                  className="admin-production-remove"
                  disabled={role._count.assignments > 0}
                  title={role._count.assignments > 0
                    ? "Remove this role from users before deleting it."
                    : undefined}
                  type="submit"
                >
                  Delete role
                </button>
              </form>
            )}
          </section>
          ))}
        </div>

        <section id="user-access" className="admin-panel" aria-labelledby="assign-role-heading">
          <div className="admin-panel-heading">
            <div>
              <span className="account-plan-kicker">USER ACCESS</span>
              <h2 id="assign-role-heading">Assign a role</h2>
            </div>
          </div>
          <form action={assignAccessRole} className="admin-production-form">
            <label className="admin-production-field">
              <span>Verified account email</span>
              <input name="email" type="email" maxLength={254} required />
            </label>
            <label className="admin-production-field">
              <span>Role</span>
              <select name="roleId" required>
                <option value="">Choose a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}{role.isSuperAdmin ? " (unrestricted)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-large" type="submit">Assign role</button>
          </form>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Assigned roles</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const bootstrapAdmin = isAdminEmail(user.email);
                  return (
                    <tr key={user.id}>
                      <td>
                        {user.name || user.email || "Account"}
                        {user.name && user.email && <small>{user.email}</small>}
                      </td>
                      <td>
                        {user.accessRoles.length
                          ? user.accessRoles.map(({ role }) => (
                              <div className="admin-access-role-chip" key={role.id}>
                                {role.name}
                                <form action={removeAccessRole}>
                                  <input name="userId" type="hidden" value={user.id} />
                                  <input name="roleId" type="hidden" value={role.id} />
                                  <button
                                    aria-label={`Remove ${role.name} from ${user.email ?? "user"}`}
                                    type="submit"
                                  >
                                    ×
                                  </button>
                                </form>
                              </div>
                            ))
                          : <span>No roles</span>}
                      </td>
                      <td>
                        {bootstrapAdmin || user.accessRoles.some(({ role }) => role.isSuperAdmin)
                          ? "Super admin"
                          : "Role-based"}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={3}>No verified user accounts.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        </div>
      </section>
    </main>
  );
}
