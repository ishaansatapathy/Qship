"use client";

import { useState } from "react";
import { ArrowRight, Mail, Sparkles, UserPlus, X } from "lucide-react";
import { useDemoMode, type DemoFeature } from "~/hooks/use-demo-mode";

interface DemoLimitModalProps {
  onClose: () => void;
  feature: DemoFeature;
}

const FEATURE_COPY: Record<
  DemoFeature,
  { title: string; body: string; primaryLabel: string; primaryHref: string }
> = {
  agent: {
    title: "Agent demo limit reached",
    body: "You've used all 3 demo Agent prompts. Sign in or connect GitHub to keep using Qship Agent.",
    primaryLabel: "Open settings",
    primaryHref: "/settings",
  },
  calendar: {
    title: "Planning demo limit reached",
    body: "You've used all 3 demo planning actions. Sign in to use the full task board and PRD workflow.",
    primaryLabel: "Open settings",
    primaryHref: "/settings",
  },
  mail: {
    title: "Discovery demo limit reached",
    body: "You've used all 3 demo discovery AI actions. Sign in to clarify requirements and generate PRDs.",
    primaryLabel: "Open settings",
    primaryHref: "/settings",
  },
};

export function DemoLimitModal({ onClose, feature }: DemoLimitModalProps) {
  const copy = FEATURE_COPY[feature];

  return (
    <div className="qship-demo-expired-overlay" role="dialog" aria-modal aria-label={copy.title}>
      <div className="qship-demo-expired-card">
        <div className="qship-demo-expired-icon">
          <Sparkles size={22} />
        </div>
        <h2 className="qship-demo-expired-title">{copy.title}</h2>
        <p className="qship-demo-expired-body">{copy.body}</p>
        <div className="qship-demo-expired-ctas">
          <a href={copy.primaryHref} className="qship-demo-expired-btn qship-demo-expired-btn--primary">
            <Mail size={14} />
            {copy.primaryLabel}
            <ArrowRight size={14} />
          </a>
          <a href="/sign-in" className="qship-demo-expired-btn qship-demo-expired-btn--ghost">
            <UserPlus size={14} />
            Create account
          </a>
        </div>
        <button type="button" className="qship-demo-expired-close" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** Gate a specific demo feature (agent / calendar / mail). */
export function useDemoAiGuard(email: string | null | undefined, feature: DemoFeature) {
  const demo = useDemoMode(email);
  const [showModal, setShowModal] = useState(false);

  const tryFeature = (): boolean => {
    if (!demo.isDemo) return true;
    if (!demo.canUseFeature(feature)) {
      setShowModal(true);
      return false;
    }
    if (!demo.recordAttempt(feature)) {
      setShowModal(true);
      return false;
    }
    return true;
  };

  const guardAiAction = (action: () => void) => {
    if (tryFeature()) action();
  };

  const modal = showModal ? <DemoLimitModal feature={feature} onClose={() => setShowModal(false)} /> : null;

  return {
    ...demo,
    feature,
    featureState: demo.getFeature(feature),
    tryFeature,
    guardAiAction,
    showLimitModal: showModal,
    setShowLimitModal: setShowModal,
    modal,
  };
}
