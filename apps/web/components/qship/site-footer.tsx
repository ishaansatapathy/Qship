import Link from "next/link";

import { QshipLogo } from "./logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Feature requests", href: "/features" },
      { label: "Task board", href: "/tasks" },
      { label: "GitHub integration", href: "/github" },
      { label: "AI reviews", href: "/reviews" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/dashboard" },
      { label: "Blog", href: "/" },
      { label: "Changelog", href: "/" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/billing" },
      { label: "Security", href: "/" },
      { label: "Contact", href: "/sign-in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-black">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 qship-grid-floor opacity-30" />

      <div className="relative mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <QshipLogo href="/" size="lg" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-500">
              Qship is an AI-assisted delivery platform that moves features from request → PRD →
              tasks → code → AI review → human approval → ship. Built for teams that care as much
              about how features ship as how fast they move.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  {col.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-neutral-400 transition hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/[0.06] pt-8 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Qship. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-neutral-400">
              Terms
            </Link>
            <Link href="/" className="hover:text-neutral-400">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
