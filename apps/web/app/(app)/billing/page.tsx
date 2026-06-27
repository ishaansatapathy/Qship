"use client";

import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { BILLING_PLAN_LIST } from "@repo/services/billing/plans";

import { trpc } from "~/trpc/client";

export default function BillingPage() {
  const utils = trpc.useUtils();
  const summary = trpc.billing.summary.useQuery(
    {},
    { retry: 1, refetchOnWindowFocus: false },
  );
  const checkout = trpc.billing.createCheckout.useMutation({
    onSuccess: async (result) => {
      if (result.mode === "demo") {
        toast.success(`Upgraded to ${result.planName} (demo mode)`);
        await utils.billing.summary.invalidate();
        return;
      }
      toast.message("Razorpay order created", {
        description: `Order ${result.orderId} — complete payment in Razorpay checkout, then confirm.`,
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const data = summary.data;
  const plans = data?.plans ?? BILLING_PLAN_LIST;
  const activeTier = data?.planTier ?? "free";
  const checkoutReady = summary.isSuccess && Boolean(data);
  const razorpayConfigured = data?.razorpayConfigured ?? false;

  return (
    <div className="qship-brief-page">
      <header className="qship-brief-header">
        <div className="qship-brief-header-main">
          <h1>Billing & plans</h1>
          <p>
            {data ? (
              <>
                {data.organizationName} · {data.planName} plan · {data.aiReviewCredits} AI review
                credits remaining
              </>
            ) : summary.isLoading ? (
              "Loading your workspace…"
            ) : summary.isError ? (
              "Showing list prices — connect the API to manage your subscription"
            ) : (
              "Choose a plan · AI credits · Razorpay checkout"
            )}
          </p>
        </div>
      </header>

      {summary.isSuccess && data ? (
        <div className="qship-req-stats" style={{ marginBottom: 24 }}>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Plan</span>
            <span className="qship-req-stat-value">{data.planName}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">AI credits</span>
            <span className="qship-req-stat-value">{data.aiReviewCredits}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Repo limit</span>
            <span className="qship-req-stat-value">{data.repositoryLimit}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Status</span>
            <span className="qship-req-stat-value">{data.billingStatus}</span>
          </div>
        </div>
      ) : summary.isLoading ? (
        <div className="qship-req-stats" style={{ marginBottom: 24, opacity: 0.6 }}>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Plan</span>
            <span className="qship-req-stat-value">—</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">AI credits</span>
            <span className="qship-req-stat-value">—</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Repo limit</span>
            <span className="qship-req-stat-value">—</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Status</span>
            <Loader2 size={14} className="qship-spin" />
          </div>
        </div>
      ) : null}

      {summary.isError ? (
        <p className="qship-req-rec" style={{ marginBottom: 20 }}>
          Could not load billing account ({summary.error.message}). Plans and pricing are shown
          below — run <code>pnpm dev</code> so the API on port 8000 is up, then refresh.
        </p>
      ) : null}

      <div
        className="qship-req-list"
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {plans.map((plan) => {
          const active = plan.id === activeTier;
          const disabled = !checkoutReady || active || checkout.isPending;
          return (
            <div key={plan.id} className="qship-req-row" style={{ cursor: "default", padding: 20 }}>
              <div className="qship-req-row-top">
                <strong>{plan.name}</strong>
                {active ? <span className="qship-req-status-pill">Current</span> : null}
              </div>
              <p style={{ margin: "8px 0", fontSize: 28, fontWeight: 600 }}>
                {plan.priceInr === 0 ? "Free" : `₹${plan.priceInr}/mo`}
              </p>
              <ul style={{ margin: "12px 0", paddingLeft: 18, fontSize: 13, opacity: 0.85 }}>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                className={active ? "qship-btn-ghost" : "qship-btn-accent"}
                disabled={disabled}
                title={
                  !checkoutReady
                    ? "Waiting for billing account — ensure API is running"
                    : undefined
                }
                onClick={() => checkout.mutate({ planTier: plan.id })}
              >
                {checkout.isPending ? (
                  <Loader2 size={14} className="qship-spin" />
                ) : active ? (
                  <>
                    <Check size={14} /> Active plan
                  </>
                ) : !checkoutReady ? (
                  "Connect API to upgrade"
                ) : (
                  <>
                    <CreditCard size={14} /> {plan.priceInr === 0 ? "Downgrade" : "Upgrade"}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {!razorpayConfigured ? (
        <p className="qship-req-rec" style={{ marginTop: 20 }}>
          <Sparkles size={14} style={{ verticalAlign: -2 }} /> Razorpay keys not set — upgrades apply
          instantly in demo mode. Set <code>RAZORPAY_KEY_ID</code> and{" "}
          <code>RAZORPAY_KEY_SECRET</code> in <code>.env</code> for live checkout (same pattern as{" "}
          <code>OPENAI_API_KEY</code> on the Agent page).
        </p>
      ) : (
        <p className="qship-req-rec" style={{ marginTop: 20 }}>
          <CreditCard size={14} style={{ verticalAlign: -2 }} /> Razorpay is configured — paid
          upgrades open a secure checkout order.
        </p>
      )}
    </div>
  );
}
