import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
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
  const session = await auth();
  if (!session?.user.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, emailVerified: true },
  });

  if (!user?.emailVerified) {
    redirect("/login?error=UnverifiedEmail");
  }

  return (
    <main className="app-shell">
      <AppFrame />
    </main>
  );
}
