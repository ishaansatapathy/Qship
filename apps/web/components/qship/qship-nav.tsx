"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Github, ArrowRight, Menu, X } from "lucide-react";
import { QshipWordmark } from "./qship-logo";
import { useQshipAuth } from "./qship-auth-provider";
import { useQshipUser } from "~/components/app/use-qship-user";

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Workflows", href: "#workflows" },
  { label: "Integrations", href: "#integrations" },
  { label: "Agent", href: "#agent" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function QshipNav() {
  const { openAuth, demoLogin, isDemoLoading } = useQshipAuth();
  const { user, isLoading } = useQshipUser();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="qship-nav">
      <div className="qship-nav-inner">
        <Link
          href="/"
          className="qship-nav-brand"
          onClick={closeMenu}
        >
          <QshipWordmark size="sm" />
        </Link>

        <nav className="qship-nav-links" aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.label} href={item.href} className="qship-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="qship-nav-actions">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="qship-nav-icon-btn"
          >
            <Github size={15} />
          </a>
          {user ? (
            <Link href="/inbox" className="qship-btn-accent qship-nav-cta" onClick={closeMenu}>
              <span className="qship-nav-cta-text">Open Qship</span>
              <ArrowRight size={15} />
            </Link>
          ) : (
            <>
              <button
                type="button"
                className="qship-btn-ghost qship-nav-login"
                onClick={() => {
                  closeMenu();
                  openAuth("sign-in");
                }}
                style={{ opacity: isLoading ? 0.7 : 1 }}
              >
                Log in
              </button>
              <button
                type="button"
                className="qship-btn-accent qship-nav-cta"
                disabled={isDemoLoading}
                onClick={() => {
                  closeMenu();
                  void demoLogin();
                }}
              >
                <span className="qship-nav-cta-text">
                  {isDemoLoading ? "Loading…" : "Get started"}
                </span>
              </button>
            </>
          )}
          <button
            type="button"
            className="qship-nav-menu-btn"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="qship-nav-mobile-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <nav className="qship-nav-mobile-panel" aria-label="Mobile">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="qship-nav-mobile-link"
                onClick={closeMenu}
              >
                {item.label}
              </a>
            ))}
            <a href="/privacy" className="qship-nav-mobile-link" onClick={closeMenu}>
              Privacy Policy
            </a>
            {user ? (
              <Link href="/inbox" className="qship-btn-accent" onClick={closeMenu}>
                Open Qship
              </Link>
            ) : (
              <button
                type="button"
                className="qship-btn-accent"
                disabled={isDemoLoading}
                onClick={() => {
                  closeMenu();
                  void demoLogin();
                }}
              >
                {isDemoLoading ? "Loading…" : "Get started"}
              </button>
            )}
          </nav>
        </>
      ) : null}
    </header>
  );
}
