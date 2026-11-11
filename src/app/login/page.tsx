import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm, { AuthLoading } from "../auth-form";

export const metadata: Metadata = {
  title: "Log in | CartonLab Lightweight 2.0",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<AuthLoading />}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginPageContent({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  return <AuthForm mode="login" error={error} />;
}
