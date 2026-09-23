import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const params = await searchParams;
  const configuredKey = process.env.OWNER_SETUP_KEY?.trim();
  const suppliedKey = params.key?.trim();

  if (!configuredKey || !suppliedKey || suppliedKey !== configuredKey) {
    redirect("/auth/login");
  }

  return (
    <Suspense fallback={null}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
