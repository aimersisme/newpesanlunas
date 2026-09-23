import { AppShell } from "@/components/app-shell";
import { OrderReviseForm } from "@/components/modules/order-revise-form";
import { getActiveBusiness } from "@/lib/business";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){const[{id},b]=await Promise.all([params,getActiveBusiness()]);return <AppShell><OrderReviseForm businessId={b.id} orderId={id}/></AppShell>}
