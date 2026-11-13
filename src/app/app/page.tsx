import { requireVerifiedUser } from "@/lib/account";
import { Suspense } from "react";
import AppFrame from "./app-frame";

export default function CartonLabApp() {
  return (
    <Suspense
      fallback={
        <main className="grid h-dvh place-items-center bg-slate-950 text-slate-100">
          Checking verified account…
        </main>
      }
    >
      <AuthenticatedCartonLabApp />
    </Suspense>
  );
}

async function AuthenticatedCartonLabApp() {
  const user = await requireVerifiedUser();

  return (
    <main className="app-shell">
      <AppFrame
        profile={{
          createdBy: user.name ?? "",
          companyName: user.companyName ?? "",
          address: user.address ?? "",
        }}
      />
    </main>
  );
}
