import { AppShell } from "@/components/app-shell";
import { ThemeManager } from "@/components/modules/theme-manager";
import { getActiveBusiness } from "@/lib/business";

export default async function AppearancePage() {
  const business = await getActiveBusiness();
  return <AppShell><ThemeManager businessId={business.id} role={business.role} /></AppShell>;
}
