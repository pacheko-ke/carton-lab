import { Suspense } from "react";
import QRCode from "qrcode";
import { isAdminEmail } from "@/lib/admin";
import { requireVerifiedUser } from "@/lib/account";
import { isProductionWorkflowStage, isRecord } from "@/lib/production-data";
import { prisma } from "@/lib/prisma";
import ProductionDashboard, {
  type ProductionDashboardJob,
  type ProductionDashboardTeam,
} from "./production-dashboard";

function textValue(data: unknown, key: string): string {
  if (!isRecord(data) || typeof data[key] !== "string") return "";
  return data[key];
}

function quantityValue(data: unknown): number | null {
  const value = textValue(data, "orderQty").trim();
  if (!value) return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0
    ? Math.floor(quantity)
    : null;
}

export default function ProductionAdminPage() {
  return (
    <Suspense
      fallback={
        <main className="grid h-dvh place-items-center bg-slate-950 text-slate-100">
          Loading production dashboard…
        </main>
      }
    >
      <AuthenticatedProductionAdminPage />
    </Suspense>
  );
}

async function AuthenticatedProductionAdminPage() {
  const user = await requireVerifiedUser();
  const memberships = await prisma.productionMembership.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      team: { select: { id: true, name: true } },
    },
  });
  const teams: ProductionDashboardTeam[] = memberships.map(({ role, team }) => ({
    ...team,
    role: role === "DESIGNER" ? "DESIGNER" : "PRODUCTION",
  }));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const jobs = teams.length
    ? await prisma.productionJob.findMany({
        where: { teamId: { in: teams.map((team) => team.id) } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, teamId: true, data: true, updatedAt: true },
      })
    : [];
  const dashboardJobs: ProductionDashboardJob[] = jobs.map((job) => {
    const rawStage = textValue(job.data, "workflowStage");
    return {
      id: job.id,
      teamId: job.teamId,
      teamName: teamNames.get(job.teamId) ?? "Production team",
      jobNo: textValue(job.data, "jobNo"),
      jobName: textValue(job.data, "jobName"),
      customer: textValue(job.data, "customer"),
      deliveryDate: textValue(job.data, "deliveryDate"),
      priority: textValue(job.data, "priority"),
      orderQty: quantityValue(job.data),
      workflowStage: isProductionWorkflowStage(rawStage)
        ? rawStage
        : "Origination",
      updatedAt: job.updatedAt.toISOString(),
    };
  });
  const profile = {
    createdBy: (user.name ?? "").slice(0, 100),
    companyName: (user.companyName ?? "").slice(0, 100),
    role: (user.role ?? "").slice(0, 100),
    contact: (user.contact ?? "").slice(0, 120),
    address: (user.address ?? "").slice(0, 120),
  };
  const qr = QRCode.create(JSON.stringify(profile), { errorCorrectionLevel: "M" });
  const profileQrCode = Array.from({ length: qr.modules.size }, (_, row) =>
    Array.from({ length: qr.modules.size }, (_, column) => qr.modules.get(row, column) !== 0),
  );

  return (
    <ProductionDashboard
      accountId={user.id}
      accountName={user.name || user.companyName || user.email || "Production user"}
      profile={profile}
      profileQrCode={profileQrCode}
      teams={teams}
      jobs={dashboardJobs}
      canManageTeams={isAdminEmail(user.email)}
    />
  );
}
