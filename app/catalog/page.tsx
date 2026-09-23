import { AppShell } from "@/components/app-shell";
import { CatalogManager } from "@/components/modules/catalog-manager";
import { getActiveBusiness } from "@/lib/business";
export const dynamic="force-dynamic";
export default async function CatalogPage(){const business=await getActiveBusiness();return <AppShell><CatalogManager businessId={business.id} role={business.role} skuPrefix={business.sku_prefix}/></AppShell>}
