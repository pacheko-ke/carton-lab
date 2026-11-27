import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm, { AuthLoading } from "../auth-form";
import { getSafeReturnPath } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "Log in | PackStudio",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    callbackUrl?: string | string[];
  }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginPageContent({ searchParams }: LoginPageProps) {
  const { error, callbackUrl } = await searchParams;
  return (
    <AuthForm
      mode="login"
      error={error}
      redirectTo={getSafeReturnPath(callbackUrl)}
    />
  );
}
