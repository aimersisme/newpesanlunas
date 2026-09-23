import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    if (auth.error || !auth.data.user) {
      return NextResponse.json({ ok:false, authenticated:false, authError:auth.error?.message ?? null }, { status:401 });
    }

    const business = await supabase.rpc("get_single_business_context");
    const dashboard = await supabase.rpc("get_single_dashboard_payload", { p_from:null, p_to:null });
    const orders = await supabase.rpc("get_single_orders_page", { p_status:"all", p_query:null, p_limit:10 });
    const receivables = await supabase.rpc("get_single_receivables_page", { p_limit:10 });

    return NextResponse.json({
      ok: !business.error && !dashboard.error && !orders.error && !receivables.error,
      version:"0.2.9",
      authenticated:true,
      userId:auth.data.user.id,
      checks:{
        business:{ok:!business.error,error:business.error?.message ?? null},
        dashboard:{ok:!dashboard.error,error:dashboard.error?.message ?? null},
        orders:{ok:!orders.error,error:orders.error?.message ?? null},
        receivables:{ok:!receivables.error,error:receivables.error?.message ?? null},
      }
    }, { headers:{"Cache-Control":"no-store"} });
  } catch (error) {
    return NextResponse.json({ ok:false, version:"0.2.9", error:error instanceof Error ? error.message : "Unknown error" }, { status:500, headers:{"Cache-Control":"no-store"} });
  }
}
