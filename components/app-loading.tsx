import { AppShell } from "@/components/app-shell";

export function AppLoading({ title = "Memuat data..." }: { title?: string }) {
  return (
    <AppShell>
      <div className="loadingHeader">
        <div className="skeleton skeletonIcon" />
        <div className="skeletonBlock">
          <div className="skeleton skeletonTitle" />
          <div className="skeleton skeletonText" />
        </div>
      </div>
      <div className="loadingCards">
        <div className="skeleton skeletonCard" />
        <div className="skeleton skeletonCard" />
        <div className="skeleton skeletonCard" />
      </div>
      <div className="skeleton skeletonPanel" />
      <p className="loadingLabel">{title}</p>
    </AppShell>
  );
}
