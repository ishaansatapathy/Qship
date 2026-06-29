"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, User, LogOut, ListChecks, Unlink, Github } from "lucide-react";

import { trpc } from "~/trpc/client";
import { useQshipUser, initials } from "~/components/app/use-qship-user";
import { useDemoMode } from "~/hooks/use-demo-mode";
import { signOutShipflow } from "~/lib/sign-out";
import { getApiUnreachableMessage, formatTrpcQueryError } from "~/lib/api-unreachable-message";

const GITHUB_SETUP_HINT =
  "Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG, and GITHUB_WEBHOOK_SECRET on Railway (webhook secret must match your GitHub App).";

function ConnectionRow({
  connected,
  connectHref,
  connectedLabel,
  onDisconnect,
  disconnecting,
  demoBlocked,
  demoBlockedHint,
  connectDisabled,
  onConnectClick,
  connectLabel = "Connect",
  onSync,
  syncing,
  statusLoading,
}: {
  connected: boolean;
  connectHref: string;
  connectedLabel: string;
  onDisconnect: () => void;
  disconnecting?: boolean;
  demoBlocked?: boolean;
  demoBlockedHint?: string;
  connectDisabled?: boolean;
  onConnectClick?: () => void;
  connectLabel?: string;
  onSync?: () => void;
  syncing?: boolean;
  statusLoading?: boolean;
}) {
  if (statusLoading) {
    return (
      <button type="button" className="qship-btn-ghost" disabled>
        Checking…
      </button>
    );
  }

  if (connected) {
    return (
      <div className="qship-set-row-actions">
        <span className="qship-set-status" data-on={true}>
          {connectedLabel}
        </span>
        {onSync ? (
          <button type="button" className="qship-btn-ghost" disabled={syncing} onClick={onSync}>
            {syncing ? "Syncing…" : "Sync repos"}
          </button>
        ) : null}
        <button
          type="button"
          className="qship-btn-ghost qship-set-disconnect"
          disabled={disconnecting}
          onClick={onDisconnect}
        >
          <Unlink size={12} />
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    );
  }

  if (demoBlocked) {
    return (
      <div className="qship-set-row-actions" style={{ flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <a href="/sign-in" className="qship-btn-accent" style={{ fontSize: 12, padding: "7px 12px" }}>
          Sign in to connect
        </a>
          {demoBlockedHint ? (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: "var(--qship-dim)", maxWidth: 220, textAlign: "right" }}>
            {demoBlockedHint}
          </p>
        ) : null}
      </div>
    );
  }

  if (!connectHref || connectHref === "#") {
    return (
      <button
        type="button"
        className="qship-btn-accent"
        disabled={connectDisabled}
        onClick={onConnectClick}
        style={{ opacity: connectDisabled ? 0.6 : 1 }}
      >
        {connectLabel}
      </button>
    );
  }

  return (
    <a href={connectHref} className="qship-btn-accent">
      Connect
    </a>
  );
}

function ApprovalToggle({
  title,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="qship-set-row">
      <span className="qship-set-row-icon">
        <ListChecks size={17} />
      </span>
      <div className="qship-set-row-meta">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="qship-set-toggle"
        data-on={enabled ? "true" : "false"}
        disabled={disabled}
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
      >
        {enabled ? "Auto-approve" : "Queue first"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useQshipUser();
  const { isDemo: isDemoUser } = useDemoMode(user?.email);
  const utils = trpc.useUtils();
  const githubStatus = trpc.github.connectionStatus.useQuery({}, { retry: 2, retryDelay: 1500 });
  const githubInstallUrl = trpc.github.getInstallUrl.useQuery(
    { returnTo: "/settings" },
    { retry: 2, retryDelay: 1500 },
  );
  const approvalDefaults = trpc.settings.getApprovalDefaults.useQuery({});
  const [name, setName] = useState("");

  useEffect(() => {
    if (user) setName(user.displayName || user.fullName || "");
  }, [user]);

  const saveProfile = trpc.auth.setupProfile.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateApproval = trpc.settings.updateApprovalDefaults.useMutation({
    onSuccess: async () => {
      await utils.settings.getApprovalDefaults.invalidate();
      toast.success("Approval defaults updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const setApprovalPref = (
    key: "autoApproveEmail" | "autoApproveAgentEmail" | "autoApproveCalendar",
    value: boolean,
  ) => {
    const current = approvalDefaults.data;
    if (!current) return;
    updateApproval.mutate({ ...current, [key]: value });
  };

  const logout = trpc.auth.logout.useMutation({
    onSettled: async () => {
      await utils.auth.me.reset();
      await signOutShipflow("/");
    },
  });

  const disconnectGithub = trpc.github.disconnect.useMutation({
    onSuccess: async () => {
      await utils.github.connectionStatus.invalidate();
      await utils.github.listRepositories.invalidate();
      toast.success("GitHub disconnected");
    },
    onError: (e) => toast.error(e.message),
  });

  const syncGithub = trpc.github.syncInstallation.useMutation({
    onSuccess: async (result) => {
      await utils.github.connectionStatus.invalidate();
      await utils.github.listRepositories.invalidate();
      if (result.connected) {
        toast.success("GitHub repositories synced");
        return;
      }
      toast.message(result.reason ?? "No GitHub installation found");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!user) return null;

  const nameChanged = name.trim().length > 0 && name.trim() !== (user.displayName || user.fullName || "");

  return (
    <div className="qship-app-content-narrow">
      {/* Account */}
      <section className="qship-set-section">
        <h2>Account</h2>
        <p>Your ShipFlow workspace identity. Display name is what teammates and the agent use.</p>

        <div className="qship-set-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
            <span className="qship-app-avatar" style={{ width: 44, height: 44, borderRadius: 10, fontSize: 16 }}>
              {user.profileImageUrl ? (
                // Remote Google avatar; next/image remote config is overkill for a 44px chip.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profileImageUrl} alt="" />
              ) : (
                initials(user.displayName ?? user.fullName, user.email)
              )}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user.fullName || "ShipFlow user"}</div>
              <div style={{ fontSize: 12.5, color: "var(--qship-dim)" }}>{user.email}</div>
            </div>
            <span className="qship-set-status" data-on={user.emailVerified} style={{ marginLeft: "auto" }}>
              {user.emailVerified ? "Verified" : "Unverified"}
            </span>
          </div>

          <div style={{ width: "100%" }}>
            <label className="qship-set-label" htmlFor="displayName">
              Display name
            </label>
            <div className="qship-set-name-row">
              <input
                id="displayName"
                className="qship-set-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should we address you?"
              />
              <button
                type="button"
                className="qship-btn-accent"
                disabled={!nameChanged || saveProfile.isPending}
                onClick={() => saveProfile.mutate({ displayName: name.trim() })}
                style={{ opacity: nameChanged ? 1 : 0.5 }}
              >
                {saveProfile.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Connections */}
      <section className="qship-set-section">
        <h2>Connections</h2>
        <p>Connect GitHub and workspace services for the full request → ship loop.</p>

        {isDemoUser ? (
          <div className="qship-demo-inbox-strip" style={{ marginBottom: 14 }}>
            <ShieldCheck size={13} />
            <span>
              Demo account uses sample pipeline data. Sign in with your workspace to connect GitHub and billing.
            </span>
          </div>
        ) : null}

        {githubInstallUrl.isSuccess && githubInstallUrl.data?.configured === false ? (
          <div className="qship-req-rec" style={{ marginBottom: 14 }}>
            {GITHUB_SETUP_HINT}
          </div>
        ) : null}

        {githubStatus.isError || githubInstallUrl.isError ? (
          <div className="qship-req-rec" style={{ marginBottom: 14 }}>
            {formatTrpcQueryError([githubInstallUrl.error, githubStatus.error])}{" "}
            <button
              type="button"
              className="qship-btn-ghost"
              style={{ marginLeft: 8, display: "inline-flex" }}
              onClick={() => {
                void githubStatus.refetch();
                void githubInstallUrl.refetch();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="qship-set-row">
          <span className="qship-set-row-icon">
            <Github size={17} />
          </span>
          <div className="qship-set-row-meta">
            <h4>GitHub</h4>
            <p>
              Repositories, webhooks, pull requests, and diff analysis via Octokit.
              {githubStatus.data?.connected && githubStatus.data.accountLogin
                ? ` Connected as ${githubStatus.data.accountLogin}.`
                : null}
            </p>
          </div>
          <ConnectionRow
            connected={githubStatus.data?.connected === true}
            statusLoading={githubStatus.isLoading || githubStatus.isFetching}
            connectHref={githubInstallUrl.data?.url ?? "#"}
            connectDisabled={githubInstallUrl.isLoading}
            connectLabel={githubInstallUrl.isLoading ? "Loading…" : "Connect"}
            onConnectClick={async () => {
              if (githubInstallUrl.data?.url) {
                window.location.href = githubInstallUrl.data.url;
                return;
              }
              const refreshed = await githubInstallUrl.refetch();
              if (refreshed.data?.url) {
                window.location.href = refreshed.data.url;
                return;
              }
              if (refreshed.data?.configured === false || githubInstallUrl.data?.configured === false) {
                toast.error(GITHUB_SETUP_HINT);
                return;
              }
              if (refreshed.isError || githubStatus.isError) {
                toast.error(formatTrpcQueryError([refreshed.error, githubInstallUrl.error, githubStatus.error]));
                return;
              }
              toast.error("Could not load GitHub install link. Refresh and try again.");
            }}
            connectedLabel={
              githubStatus.data?.repositoryCount
                ? `Connected · ${githubStatus.data.repositoryCount} repo${githubStatus.data.repositoryCount === 1 ? "" : "s"}`
                : "Connected"
            }
            onDisconnect={() => disconnectGithub.mutate({})}
            disconnecting={disconnectGithub.isPending}
            onSync={() => syncGithub.mutate({})}
            syncing={syncGithub.isPending}
            demoBlocked={isDemoUser && githubStatus.data?.connected !== true}
            demoBlockedHint="Connecting a live GitHub org replaces demo sample data."
          />
        </div>
      </section>

      {/* Approval defaults */}
      <section className="qship-set-section">
        <h2>Approval defaults</h2>
        <p>
          Safe by default — agent actions go to Release approvals first. Turn on auto-approve when you
          trust an action type and want it to run immediately.
        </p>

        <ApprovalToggle
          title="Agent PRDs & plans"
          description="PRDs, task breakdowns, and delivery plans drafted by ShipFlow Agent."
          enabled={approvalDefaults.data?.autoApproveAgentEmail ?? false}
          disabled={approvalDefaults.isLoading || updateApproval.isPending}
          onToggle={(value) => setApprovalPref("autoApproveAgentEmail", value)}
        />

        <ApprovalToggle
          title="AI reviews & fixes"
          description="Code review comments and suggested fixes from the agent."
          enabled={approvalDefaults.data?.autoApproveEmail ?? false}
          disabled={approvalDefaults.isLoading || updateApproval.isPending}
          onToggle={(value) => setApprovalPref("autoApproveEmail", value)}
        />

        <ApprovalToggle
          title="Release & ship actions"
          description="Merge, deploy, and production release steps queued by the agent."
          enabled={approvalDefaults.data?.autoApproveCalendar ?? false}
          disabled={approvalDefaults.isLoading || updateApproval.isPending}
          onToggle={(value) => setApprovalPref("autoApproveCalendar", value)}
        />
      </section>

      {/* Security */}
      <section className="qship-set-section">
        <h2>Security</h2>
        <p>Add a second factor for email sign-in. Google sign-in already uses Google&apos;s security.</p>

        <div className="qship-set-row">
          <span className="qship-set-row-icon">
            <ShieldCheck size={17} />
          </span>
          <div className="qship-set-row-meta">
            <h4>Two-factor authentication</h4>
            <p>{user.twoFactorEnabled ? "Enabled — a code is required at sign-in." : "Off — coming in a future release."}</p>
          </div>
          <button
            type="button"
            className="qship-btn-ghost"
            disabled
            title="Two-factor authentication is not available yet"
            style={{ fontSize: 13, padding: "8px 16px", opacity: 0.6 }}
          >
            Coming soon
          </button>
        </div>
      </section>

      {/* Session */}
      <section className="qship-set-section">
        <h2>Session</h2>
        <p>Signed in as {user.email}.</p>
        <div className="qship-set-row">
          <span className="qship-set-row-icon">
            <User size={17} />
          </span>
          <div className="qship-set-row-meta">
            <h4>Sign out</h4>
            <p>End your session on this device.</p>
          </div>
          <button
            type="button"
            className="qship-btn-ghost"
            onClick={() => logout.mutate({})}
            disabled={logout.isPending}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            <LogOut size={14} />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}
