import CompanyContent from "./company-content";

type CompanyPageProps = {
  searchParams: Promise<{
    updated?: string | string[];
    invited?: string | string[];
  }>;
};

export default function CompanyPage(props: CompanyPageProps) {
  return <CompanyContent searchParams={props.searchParams} />;
}
