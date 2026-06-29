"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Headphones,
  Loader2,
  Mail,
  Phone,
  Rocket,
  Sparkles,
} from "lucide-react";

import { trpc } from "~/trpc/client";

type ChannelKey = "email" | "support_ticket" | "customer_call" | "manual";

const CHANNELS: {
  key: ChannelKey;
  label: string;
  icon: typeof Mail;
  desc: string;
  sample?: {
    title: string;
    rawRequest: string;
    channelMeta: Record<string, string>;
    externalId: string;
  };
}[] = [
  {
    key: "email",
    label: "Email",
    icon: Mail,
    desc: "Support emails land here — triage + duplicate check run automatically.",
    sample: {
      title: "CSV export for compliance audit",
      rawRequest:
        "From: legal@acme.com\nSubject: SOC2 audit export\n\nHi team — we need a CSV export of all shipped features with approver names and ship dates for our auditor.",
      channelMeta: { from: "legal@acme.com", subject: "SOC2 audit export" },
      externalId: `email-${Date.now()}`,
    },
  },
  {
    key: "support_ticket",
    label: "Support tickets",
    icon: Headphones,
    desc: "Zendesk / Intercom tickets sync into the same pipeline.",
    sample: {
      title: "Bulk invite admins from CSV",
      rawRequest:
        "Ticket #4821 · Priority: High\n\nEnterprise customer wants to upload a CSV of admin emails and bulk-invite them to the workspace.",
      channelMeta: { ticketId: "4821", system: "zendesk", priority: "high" },
      externalId: `ticket-4821-${Date.now()}`,
    },
  },
  {
    key: "customer_call",
    label: "Customer calls",
    icon: Phone,
    desc: "Call notes transcribed and ingested as structured requests.",
    sample: {
      title: "Slack alert when PR merges",
      rawRequest:
        "Call notes · Acme Corp QBR\n\nCustomer asked for a Slack notification when their PR is approved and merged. Must include PR link and approver name.",
      channelMeta: { account: "Acme Corp", callType: "QBR", rep: "Priya" },
      externalId: `call-${Date.now()}`,
    },
  },
  {
    key: "manual",
    label: "In-app",
    icon: Rocket,
    desc: "Employees submit from Feature Requests — already working.",
  },
];

export default function InboxPage() {
  const utils = trpc.useUtils();
  const [active, setActive] = useState<ChannelKey | null>(null);
  const [title, setTitle] = useState("");
  const [rawRequest, setRawRequest] = useState("");

  const intake = trpc.feature.intakeSummary.useQuery({});
  const features = trpc.feature.list.useQuery({});

  const intakeMutation = trpc.feature.intakeFromChannel.useMutation({
    onSuccess: async (result) => {
      await utils.feature.invalidate();
      setActive(null);
      setTitle("");
      setRawRequest("");
      if (result.educated) {
        toast.message("Existing capability detected", {
          description: "ShipFlow educated instead of duplicating work. Open the request to review.",
        });
      } else {
        toast.success("Intake received — triage complete");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const recent = (features.data ?? [])
    .filter((row) => row.source && row.source !== "manual")
    .slice(0, 8);

  const counts = intake.data ?? {
    total: 0,
    manual: 0,
    email: 0,
    support_ticket: 0,
    customer_call: 0,
    api: 0,
  };

  function openChannel(key: ChannelKey) {
    if (key === "manual") return;
    const channel = CHANNELS.find((c) => c.key === key);
    if (!channel?.sample) return;
    setActive(key);
    setTitle(channel.sample.title);
    setRawRequest(channel.sample.rawRequest);
  }

  function submitChannel(key: Exclude<ChannelKey, "manual">) {
    const channel = CHANNELS.find((c) => c.key === key);
    if (!channel?.sample) return;
    intakeMutation.mutate({
      source: key,
      title: title.trim(),
      rawRequest: rawRequest.trim(),
      externalId: channel.sample.externalId,
      channelMeta: channel.sample.channelMeta,
    });
  }

  return (
    <div className="qship-app-page">
      <div className="qship-brief-page">
        <header className="qship-brief-header qship-intake-header">
          <div className="qship-brief-header-main">
            <div className="qship-intake-icon-wrap">
              <Mail size={18} />
            </div>
            <div>
              <h1>Intake hub</h1>
              <p>Simulate email, support, and call intake — or connect webhooks in production.</p>
            </div>
          </div>
          <Link href="/requests" className="qship-btn-accent">
            Open requests
            <ArrowRight size={14} />
          </Link>
        </header>

        <div className="qship-req-stats qship-intake-stats qship-content-reveal">
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Total intake</span>
            <span className="qship-req-stat-value">{counts.total}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Email</span>
            <span className="qship-req-stat-value">{counts.email}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Support</span>
            <span className="qship-req-stat-value">{counts.support_ticket}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Calls</span>
            <span className="qship-req-stat-value">{counts.customer_call}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">In-app</span>
            <span className="qship-req-stat-value">{counts.manual}</span>
          </div>
        </div>

        <section className="qship-brief-section qship-intake-section qship-content-reveal">
          <div className="qship-brief-section-head">
            <Sparkles size={14} style={{ opacity: 0.55 }} />
            <h2>Channels</h2>
            <span className="qship-intake-section-hint">Simulate to test intake</span>
          </div>
          <div className="qship-brief-section-body qship-intake-channel-list">
            {CHANNELS.map((channel) => {
              const isActive = active === channel.key;
              const isExternal = channel.key !== "manual";

              return (
                <div
                  key={channel.key}
                  className="qship-intake-channel"
                  data-active={isActive}
                >
                  <div className="qship-intake-channel-row">
                    <div className="qship-intake-channel-icon" aria-hidden>
                      <channel.icon size={17} strokeWidth={1.75} />
                    </div>
                    <div className="qship-intake-channel-copy">
                      <div className="qship-intake-channel-title-row">
                        <strong>{channel.label}</strong>
                        {isExternal ? (
                          <button
                            type="button"
                            className="qship-intake-action"
                            onClick={() => openChannel(channel.key)}
                          >
                            Simulate
                          </button>
                        ) : (
                          <Link href="/requests" className="qship-intake-action">
                            Open requests
                          </Link>
                        )}
                      </div>
                      <p className="qship-intake-channel-desc">{channel.desc}</p>
                    </div>
                  </div>

                    {isActive && isExternal ? (
                      <div className="qship-intake-form">
                        <label className="qship-req-field">
                          <span>Title</span>
                          <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Feature title"
                          />
                        </label>
                        <label className="qship-req-field">
                          <span>Payload</span>
                          <textarea
                            rows={4}
                            value={rawRequest}
                            onChange={(e) => setRawRequest(e.target.value)}
                            placeholder="Email body, ticket text, or call notes"
                          />
                        </label>
                        <div className="qship-intake-form-actions">
                          <button
                            type="button"
                            className="qship-btn-accent"
                            disabled={intakeMutation.isPending || title.length < 3 || rawRequest.length < 10}
                            onClick={() => submitChannel(channel.key as Exclude<ChannelKey, "manual">)}
                          >
                            {intakeMutation.isPending ? (
                              <>
                                <Loader2 size={14} className="qship-spin" /> Sending…
                              </>
                            ) : (
                              <>Send to pipeline</>
                            )}
                          </button>
                          <button
                            type="button"
                            className="qship-btn-ghost"
                            onClick={() => setActive(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="qship-brief-section qship-content-reveal">
          <div className="qship-brief-section-head">
            <Rocket size={14} />
            <h2>Recent external intake</h2>
          </div>
          <div className="qship-brief-section-body qship-brief-section-body--attention">
            {recent.length === 0 ? (
              <div className="qship-app-empty" style={{ padding: "20px 0" }}>
                <p style={{ margin: 0, fontSize: 13, color: "var(--qship-muted)" }}>
                  No external intake yet — click <strong>Simulate</strong> on Email, Support, or Calls above.
                </p>
              </div>
            ) : (
              <div className="qship-brief-attention-stack">
                {recent.map((feature) => (
                  <Link
                    key={feature.id}
                    href={`/requests?id=${encodeURIComponent(feature.id)}`}
                    className="qship-brief-attention-card"
                  >
                    <div className="qship-brief-attention-card-inner">
                      <div className="qship-brief-attention-card-head">
                        <span className="qship-req-status-pill">{feature.source}</span>
                        <span className="qship-brief-attention-time">{feature.status}</span>
                      </div>
                      <h3 className="qship-brief-attention-title">{feature.title}</h3>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
