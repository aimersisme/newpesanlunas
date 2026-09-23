import { JoinInvitation } from "@/components/modules/join-invitation";
export const dynamic = "force-dynamic";
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <JoinInvitation token={params.token ?? ""} />;
}
