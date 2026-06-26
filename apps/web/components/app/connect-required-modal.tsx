"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowRight, Calendar, LogIn, Mail, UserPlus, X } from "lucide-react";

import { trpc } from "~/trpc/client";
import { useDemoMode } from "~/hooks/use-demo-mode";
import {
  getQueueIntegrationRequirement,
  integrationRequirementFromError,
  type IntegrationRequirement,
} from "~/lib/queue-integration-gate";

const COPY: Record<
  IntegrationRequirement,
  { title: string; body: string; primaryLabel: string; icon: typeof Mail }
> = {
  gmail: {
    title: "Connect GitHub to proceed",
    body: "This item stays in your approval queue until a repository is connected. Link GitHub in Settings to analyze PRs and post reviews.",
    primaryLabel: "Connect GitHub",
    icon: Mail,
  },
  calendar: {
    title: "Connect workspace integrations",
    body: "This action stays in your approval queue until integrations are configured. Complete setup in Settings to continue the ShipFlow loop.",
    primaryLabel: "Open settings",
    icon: Calendar,
  },
};

const DEMO_COPY: Record<
  IntegrationRequirement,
  { title: string; body: string; primaryLabel: string; icon: typeof Mail }
> = {
  gmail: {
    title: "Sign in for full workflow",
    body: "Demo mode shows sample data only. Sign in with your workspace to connect GitHub and run real PRD → ship flows.",
    primaryLabel: "Sign in to ShipFlow",
    icon: Mail,
  },
  calendar: {
    title: "Sign in for full workflow",
    body: "Demo mode limits planning actions. Sign in with your workspace to use the full task board and approval gate.",
    primaryLabel: "Sign in to ShipFlow",
    icon: Calendar,
  },
};

export function ConnectRequiredModal({
  requirement,
  isDemoUser,
  onClose,
}: {
  requirement: IntegrationRequirement;
  isDemoUser?: boolean;
  onClose: () => void;
}) {
  const copy = isDemoUser ? DEMO_COPY[requirement] : COPY[requirement];
  const Icon = copy.icon;

  return (
    <div
      className="qship-demo-expired-overlay"
      role="dialog"
      aria-modal
      aria-label={copy.title}
      onClick={onClose}
    >
      <div
        className="qship-demo-expired-card qship-connect-gate-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qship-connect-gate-icon" data-service={requirement}>
          <Icon size={22} />
        </div>
        <h2 className="qship-demo-expired-title">{copy.title}</h2>
        <p className="qship-demo-expired-body">{copy.body}</p>
        <p className="qship-connect-gate-note">
          {isDemoUser
            ? "Demo mode uses sample pipeline data. Sign in with your workspace to connect GitHub and run live delivery flows."
            : "Nothing was sent. Your queued item is unchanged."}
        </p>
        <div className="qship-demo-expired-ctas">
          {isDemoUser ? (
            <>
              <Link
                href="/sign-in"
                className="qship-demo-expired-btn qship-demo-expired-btn--primary"
                onClick={onClose}
              >
                <LogIn size={14} />
                {copy.primaryLabel}
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/sign-in"
                className="qship-demo-expired-btn qship-demo-expired-btn--ghost"
                onClick={onClose}
              >
                <UserPlus size={14} />
                Create account
              </Link>
            </>
          ) : (
            <Link
              href="/settings"
              className="qship-demo-expired-btn qship-demo-expired-btn--primary"
              onClick={onClose}
            >
              {requirement === "gmail" ? <Mail size={14} /> : <Calendar size={14} />}
              {copy.primaryLabel}
              <ArrowRight size={14} />
            </Link>
          )}
          <button
            type="button"
            className="qship-demo-expired-btn qship-demo-expired-btn--ghost"
            onClick={onClose}
          >
            Stay on page
          </button>
        </div>
        <button type="button" className="qship-demo-expired-close" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** Block queue approve when Gmail/Calendar is required but not connected. */
export function useQueueIntegrationGate(email: string | null | undefined) {
  const demo = useDemoMode(email);
  const [requirement, setRequirement] = useState<IntegrationRequirement | null>(null);

  const inboxStatus = trpc.inbox.connectionStatus.useQuery({});
  const calendarStatus = trpc.calendar.connectionStatus.useQuery({});

  const connections = useMemo(
    () => ({
      isDemoUser: demo.isDemo,
      gmailConnected: inboxStatus.data?.gmail === "connected",
      calendarConnected: calendarStatus.data?.googlecalendar === "connected",
    }),
    [demo.isDemo, inboxStatus.data?.gmail, calendarStatus.data?.googlecalendar],
  );

  const checkBeforeApprove = useCallback(
    (kind: string): boolean => {
      const needed = getQueueIntegrationRequirement(kind, connections);
      if (needed) {
        setRequirement(needed);
        return false;
      }
      return true;
    },
    [connections],
  );

  const showRequirementFromError = useCallback((message: string) => {
    const needed = integrationRequirementFromError(message);
    if (needed) setRequirement(needed);
    return needed;
  }, []);

  const modal = requirement ? (
    <ConnectRequiredModal
      requirement={requirement}
      isDemoUser={demo.isDemo}
      onClose={() => setRequirement(null)}
    />
  ) : null;

  return {
    checkBeforeApprove,
    showRequirementFromError,
    modal,
    connections,
  };
}
