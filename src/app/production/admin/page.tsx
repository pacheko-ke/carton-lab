import { Suspense } from "react";
import QRCode from "qrcode";
import { requireVerifiedUser } from "@/lib/account";
import AppFrame from "@/app/app/app-frame";

export default function ProductionAdminPage() {
  return (
    <Suspense
      fallback={
        <main className="grid h-dvh place-items-center bg-slate-950 text-slate-100">
          Checking verified account…
        </main>
      }
    >
      <AuthenticatedProductionAdminPage />
    </Suspense>
  );
}

async function AuthenticatedProductionAdminPage() {
  const user = await requireVerifiedUser();
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
    <main className="app-shell">
      <AppFrame
        accountId={user.id}
        profile={profile}
        profileQrCode={profileQrCode}
        workspace="production"
      />
    </main>
  );
}
