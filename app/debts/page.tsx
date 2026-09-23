import { AppShell } from "@/components/app-shell";
import { DebtsManager } from "@/components/modules/debts-manager";
import { getActiveBusiness } from "@/lib/business";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const business = await getActiveBusiness();
  return <AppShell><DebtsManager businessId={business.id}/></AppShell>;
}
