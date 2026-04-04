"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/send", label: "Send", icon: "↑" },
  { href: "/dashboard/pay", label: "Pay", icon: "⚡" },
  { href: "/dashboard/history", label: "History", icon: "☰" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-line z-50">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 text-xs font-medium transition-colors ${
                active ? "text-accent" : "text-tertiary"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
