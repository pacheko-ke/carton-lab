import { redirect } from "next/navigation";

type AccountPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
    marketing?: string | string[];
  }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const dashboardParams = new URLSearchParams({ view: "account" });
  if (typeof params.billing === "string") {
    dashboardParams.set("billing", params.billing);
  }
  if (typeof params.marketing === "string") {
    dashboardParams.set("marketing", params.marketing);
  }
  redirect(`/production/admin?${dashboardParams.toString()}`);
}
