import { AppShell } from "@/components/app-shell";
import { CustomersManager } from "@/components/modules/customers-manager";
import { getActiveBusiness } from "@/lib/business";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const business = await getActiveBusiness();
  return <AppShell><CustomersManager businessId={business.id} role={business.role} /></AppShell>;
}
