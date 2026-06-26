"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, FlaskConical, Rocket, Sparkles, X } from "lucide-react";
import { useDemoMode, type DemoFeature } from "~/hooks/use-demo-mode";

interface DemoBarProps {
  email: string | null | undefined;
}

const FEATURE_LINKS: { feature: DemoFeature; href: string; icon: typeof Bot }[] = [
  { feature: "agent", href: "/agent", icon: Bot },
  { feature: "calendar", href: "/requests", icon: Rocket },
  { feature: "mail", href: "/brief", icon: Sparkles },
];

export function DemoBar({ email }: DemoBarProps) {
  const { isDemo, limits } = useDemoMode(email);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem("thread_demo_bar_dismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  if (!mounted || !isDemo || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("thread_demo_bar_dismissed", "1");
  };

  const allExhausted = FEATURE_LINKS.every(({ feature }) => limits[feature].isExhausted);

  return (
    <div className="qship-demo-bar" role="status" aria-label="Demo workspace">
      <div className="qship-demo-bar-main">
        <FlaskConical size={13} className="qship-demo-bar-icon" aria-hidden />
        <span className="qship-demo-bar-label">Demo limits</span>
        <span className="qship-demo-bar-sep" aria-hidden />
        <div className="qship-demo-bar-features">
          {FEATURE_LINKS.map(({ feature, href, icon: Icon }) => {
            const state = limits[feature];
            return (
              <Link
                key={feature}
                href={href}
                className="qship-demo-bar-feature"
                data-state={state.isExhausted ? "exhausted" : state.remaining <= 1 ? "low" : "ok"}
              >
                <Icon size={11} />
                {state.label} {state.remaining}/{state.limit}
              </Link>
            );
          })}
        </div>
        {allExhausted ? (
          <span className="qship-demo-bar-count" data-state="exhausted">
            All demo AI used
          </span>
        ) : null}
      </div>
      <div className="qship-demo-bar-actions">
        <Link href="/settings" className="qship-demo-bar-cta">
          Connect GitHub
        </Link>
        <button type="button" className="qship-demo-bar-dismiss" aria-label="Dismiss" onClick={handleDismiss}>
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
