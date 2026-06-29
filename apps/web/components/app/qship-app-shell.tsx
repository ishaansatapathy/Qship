"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Search,
  LogOut,
  ChevronsUpDown,
  PanelsTopLeft,
  Bot,
  BarChart2,
  Menu,
  X,
  Sun,
  Rocket,
  CreditCard,
  Kanban,
  Inbox,
} from "lucide-react";

import { QshipWordmark } from "~/components/qship/qship-logo";
import { QshipCommand } from "./qship-command";
import { ShortcutsHelp } from "./shortcuts-help";
import { useQshipUser, initials } from "./use-qship-user";
import { useSyncEvents } from "~/hooks/use-sync-events";
import { DemoBar } from "./demo-bar";
import { signOutShipflow } from "~/lib/sign-out";

const NAV = [
  { label: "Overview", href: "/brief", icon: Sun },
  { label: "Intake", href: "/inbox", icon: Inbox },
  { label: "Requests", href: "/requests", icon: Rocket },
  { label: "Tasks", href: "/tasks", icon: Kanban },
  { label: "Agent", href: "/agent", icon: Bot },
  { label: "Analytics", href: "/analytics", icon: BarChart2 },
  { label: "Billing", href: "/billing", icon: CreditCard },
];

const PAGE_META: Record<string, { title: string; sub: string }> = {
  "/brief": { title: "Pipeline overview", sub: "Status, focus, and what needs you next" },
  "/inbox": { title: "Intake hub", sub: "Email, support, calls, and in-app feature requests" },
  "/requests": { title: "Feature Requests", sub: "Submit, triage, and ship product work" },
  "/tasks": { title: "Engineering board", sub: "Kanban view of tasks across all features" },
  "/agent": { title: "ShipFlow Agent", sub: "PRD, tasks, reviews — with human oversight" },
  "/analytics": { title: "Analytics", sub: "Delivery pipeline and agent activity" },
  "/billing": { title: "Billing", sub: "Plans, AI credits, and Razorpay checkout" },
  "/settings": { title: "Settings", sub: "Workspace, GitHub, and approvals" },
};

export function QshipAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, isError } = useQshipUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queueCount = 0;
  useSyncEvents();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }

      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const navLinks = (
    <>
      <span className="qship-app-nav-label">Workspace</span>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="qship-app-nav-item"
            data-active={active}
            onClick={() => setMobileNavOpen(false)}
          >
            <item.icon size={16} />
            {item.label}
            {item.href === "/requests" && queueCount > 0 && (
              <span className="qship-app-nav-count">{queueCount}</span>
            )}
          </Link>
        );
      })}

      <span className="qship-app-nav-label">Account</span>
      <Link
        href="/settings"
        className="qship-app-nav-item"
        data-active={pathname === "/settings"}
        onClick={() => setMobileNavOpen(false)}
      >
        <Settings size={16} />
        Settings
      </Link>
      <Link href="/" className="qship-app-nav-item" onClick={() => setMobileNavOpen(false)}>
        <PanelsTopLeft size={16} />
        Landing page
      </Link>
    </>
  );

  if (isLoading) {
    return (
      <div className="qship-page qship-app">
        <aside className="qship-app-side">
          <div className="qship-app-side-head">
            <Link href="/requests" className="qship-app-side-brand">
              <QshipWordmark size="sm" />
            </Link>
          </div>
          <nav className="qship-app-nav">
            <span className="qship-app-nav-label">Workspace</span>
            {NAV.map((item) => (
              <span key={item.href} className="qship-app-nav-item qship-app-nav-item--skeleton">
                <item.icon size={16} />
                {item.label}
              </span>
            ))}
          </nav>
        </aside>
        <div className="qship-app-main">
          <header className="qship-app-topbar">
            <span className="qship-app-title">Loading…</span>
          </header>
          <main className="qship-app-content">
            <div className="qship-app-loading-bar" aria-hidden />
          </main>
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="qship-page qship-app-splash">
        <div className="qship-app-spinner" aria-label="Loading" />
      </div>
    );
  }

  const meta = PAGE_META[pathname ?? "/brief"] ?? { title: "ShipFlow", sub: "" };

  return (
    <div className="qship-page qship-app">
      {mobileNavOpen ? (
        <button
          type="button"
          className="qship-app-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside className="qship-app-side" data-open={mobileNavOpen ? "true" : undefined}>
        <div className="qship-app-side-head">
          <Link href="/requests" className="qship-app-side-brand" onClick={() => setMobileNavOpen(false)}>
            <QshipWordmark size="sm" />
          </Link>
          <button
            type="button"
            className="qship-app-mobile-close"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <nav className="qship-app-nav">{navLinks}</nav>

        <div className="qship-app-user" ref={menuRef}>
          {menuOpen && (
            <div className="qship-app-menu">
              <Link href="/settings" className="qship-app-menu-item" onClick={() => setMenuOpen(false)}>
                <Settings size={14} />
                Settings
              </Link>
              <div className="qship-app-menu-sep" />
              <button
                type="button"
                className="qship-app-menu-item"
                data-danger="true"
                onClick={() => void signOutShipflow("/")}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}

          <button type="button" className="qship-app-user-btn" onClick={() => setMenuOpen((v) => !v)}>
            <span className="qship-app-avatar">
              {user.profileImageUrl ? (
                // Remote Google avatar; next/image remote config is overkill for a 28px chip.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profileImageUrl} alt="" />
              ) : (
                initials(user.displayName ?? user.fullName, user.email)
              )}
            </span>
            <span className="qship-app-user-meta">
              <span className="qship-app-user-name">{user.displayName || user.fullName || "ShipFlow user"}</span>
            </span>
            <ChevronsUpDown size={15} style={{ color: "var(--qship-dim)", flexShrink: 0 }} />
          </button>
        </div>
      </aside>

      <div className="qship-app-main">
        <header className="qship-app-topbar">
          <button
            type="button"
            className="qship-app-mobile-menu-btn qship-app-iconbtn"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={16} />
          </button>

          <button
            type="button"
            className="qship-app-mobile-cmd qship-app-iconbtn"
            aria-label="Open command palette"
            onClick={() => setCmdOpen(true)}
          >
            <Search size={16} />
          </button>

          <span className="qship-app-title">
            {meta.title}
            {meta.sub && <span className="qship-app-title-sub">{meta.sub}</span>}
          </span>

          <button type="button" className="qship-app-search" onClick={() => setCmdOpen(true)}>
            <Search size={14} />
            <span>Search commands…</span>
            <span className="qship-app-search-kbd">
              <kbd className="qship-app-kbd">⌘</kbd>
              <kbd className="qship-app-kbd">K</kbd>
            </span>
          </button>

          <div style={{ flex: 1 }} />
        </header>

        <DemoBar email={user.email} />
        <main className="qship-app-content">{children}</main>
      </div>

      <QshipCommand
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
