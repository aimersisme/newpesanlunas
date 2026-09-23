import type { LucideIcon } from "lucide-react";

export function StatCard({ icon: Icon, label, value, tone = "green" }: { icon: LucideIcon; label: string; value: string; tone?: "green" | "red" | "amber" }) {
  return (
    <article className={`statCard ${tone}`}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
