import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm, { AuthLoading } from "../auth-form";
import { getSafeReturnPath } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "Create an account | PackStudio",
};

type SignupPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    callbackUrl?: string | string[];
  }>;
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignupPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupPageContent({ searchParams }: SignupPageProps) {
  const { error, callbackUrl } = await searchParams;
  return (
    <AuthForm
      mode="signup"
      error={error}
      redirectTo={getSafeReturnPath(callbackUrl, "/production/admin")}
    />
  );
}
