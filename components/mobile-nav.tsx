"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListOrdered, WalletCards, MoreHorizontal } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Beranda", icon: Home },
  { href: "/orders", label: "Pesanan", icon: ListOrdered },
  { href: "/receivables", label: "Piutang", icon: WalletCards },
  { href: "/more", label: "Lainnya", icon: MoreHorizontal },
];

const moreRoutes = ["/more","/customers","/catalog","/invoices","/custom-fields","/payment-methods","/message-templates","/settings","/team","/reports","/activity","/whatsapp","/account","/appearance"];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="mobileNav" aria-label="Navigasi utama">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/more"
          ? moreRoutes.some((route: string) => pathname.startsWith(route))
          : pathname === href || (href === "/orders" && pathname.startsWith("/orders"));
        return (
          <Link className={`mobileNavItem ${active ? "active" : ""}`} href={href} key={href}>
            <Icon size={22} strokeWidth={active ? 2.7 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
