"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

const tabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/materials", label: "Raw Materials" },
  { href: "/designs", label: "Designs" },
  { href: "/invoices", label: "Invoices" },
  { href: "/approvals", label: "Approvals" },
  { href: "/products", label: "Products" },
  { href: "/scan", label: "Scan" },
  { href: "/expenses", label: "Expenses" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <header className="topnav">
      <div className="nav-left">
        <div className="wordmark">
          TURN,OVER.
          <small>Stock &amp; Design ERP</small>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={pathname === t.href ? "active" : ""}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="nav-right" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span>Admin · KeeKooTech</span>
        <button className="link-btn" onClick={() => logout()} style={{ fontSize: 11 }}>
          Log Out
        </button>
      </div>
    </header>
  );
}