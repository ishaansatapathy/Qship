import Link from "next/link";

import { QshipLogo } from "./logo";

const nav = [
  { label: "Platform", href: "/features" },
  { label: "Workflow", href: "/dashboard" },
  { label: "Pricing", href: "/billing" },
  { label: "Enterprise", href: "/sign-in" },
];

export function SiteHeader() {
  return (
    <>
      <div className="qship-announce-bar relative overflow-hidden px-4 py-2 text-center text-xs text-white/95">
        <span>
          New — Qship Agentic Delivery: from feature request to production with AI review &amp; human
          approval →{" "}
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-white">
            Explore
          </Link>
        </span>
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <QshipLogo size="md" />

          <nav className="hidden items-center gap-8 lg:flex">
            {nav.map((item) => (
              <Link key={item.label} href={item.href} className="qship-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="qship-nav-link hidden sm:inline">
              Log in
            </Link>
            <Link href="/sign-in" className="qship-btn-primary hidden sm:inline-flex">
              Book a demo
            </Link>
            <Link href="/dashboard" className="qship-btn-ghost">
              Get started
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
