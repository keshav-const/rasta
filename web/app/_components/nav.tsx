"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, hint }: { href: string; label: string; hint?: string }) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-ink text-paper shadow-[0_10px_30px_-15px_rgba(23,20,15,0.6)]"
          : "text-ink-soft hover:bg-paper-soft"
      }`}
    >
      <span className="font-medium">{label}</span>
      {hint && (
        <span
          className={`font-mono text-[11px] tabular-nums ${
            active ? "text-paper/60" : "text-ink-mute"
          }`}
        >
          {hint}
        </span>
      )}
    </Link>
  );
}
