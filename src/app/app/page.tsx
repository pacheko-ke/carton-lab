import { requireVerifiedUser } from "@/lib/account";
import QRCode from "qrcode";
import { Suspense } from "react";
import AppFrame from "./app-frame";
import { redirect } from "next/navigation";

export default function PackStudioApp() {
  return (
    <Suspense
      fallback={
        <main className="grid h-dvh place-items-center bg-slate-950 text-slate-100">
          Checking verified account…
        </main>
      }
    >
      <AuthenticatedPackStudioApp />
    </Suspense>
  );
}

async function AuthenticatedPackStudioApp() {
  const user = await requireVerifiedUser();
  if (!user.companyMembership) redirect("/production/admin?view=account");
  const company = user.companyMembership.company;
  const profile = {
    createdBy: (user.name ?? "").slice(0, 100),
    companyName: company.name.slice(0, 100),
    role: (user.role ?? "").slice(0, 100),
    contact: (company.contactPhone || company.contactEmail).slice(0, 120),
    address: company.address.slice(0, 120),
  };
  const qr = QRCode.create(JSON.stringify(profile), { errorCorrectionLevel: "M" });
  const profileQrCode = Array.from({ length: qr.modules.size }, (_, row) =>
    Array.from({ length: qr.modules.size }, (_, column) => qr.modules.get(row, column) !== 0),
  );

  return (
    <main className="app-shell">
      <AppFrame accountId={user.id} profile={profile} profileQrCode={profileQrCode} />
    </main>
  );
}
