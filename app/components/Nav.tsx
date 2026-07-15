"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Single firm" },
  { href: "/batch", label: "Batch" },
  { href: "/hub", label: "Outreach Hub" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <nav className="topnav">
      <span className="brand">Outreach Engine</span>
      <div className="tabs">
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={active ? "tab active" : "tab"}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
