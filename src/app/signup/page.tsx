import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm, { AuthLoading } from "../auth-form";

export const metadata: Metadata = {
  title: "Create an account | CartonLab Lightweight 2.0",
};

type SignupPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignupPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupPageContent({ searchParams }: SignupPageProps) {
  const { error } = await searchParams;
  return <AuthForm mode="signup" error={error} />;
}
