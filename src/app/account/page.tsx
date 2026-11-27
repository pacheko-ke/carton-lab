import AccountContent from "./account-content";

type AccountPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
    marketing?: string | string[];
  }>;
};

export default function AccountPage(props: AccountPageProps) {
  return <AccountContent searchParams={props.searchParams} />;
}
