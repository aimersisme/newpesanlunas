import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth/login");
  const { data: membership } = await supabase.from("business_members").select("id").eq("status", "active").limit(1).maybeSingle();
  if (membership) redirect("/dashboard");
  return <OnboardingForm />;
}
