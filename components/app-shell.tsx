import { MobileNav } from "@/components/mobile-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="deviceStage">
      <section className="phoneApp">
        <div className="screenContent">{children}</div>
        <MobileNav />
      </section>
    </main>
  );
}
