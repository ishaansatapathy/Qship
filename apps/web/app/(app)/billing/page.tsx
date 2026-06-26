"use client";

import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";

export default function BillingPage() {
  const utils = trpc.useUtils();
  const summary = trpc.billing.summary.useQuery({});
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

  if (summary.isLoading) {
    return (
      <div className="qship-brief-page">
        <Loader2 className="qship-spin" size={20} />
      </div>
    );
  }

  const data = summary.data;
  if (!data) {
    return (
      <div className="qship-brief-page">
        <p>Join a workspace to manage billing.</p>
      </div>
    );
  }

  return (
    <div className="qship-brief-page">
      <header className="qship-brief-header">
        <div className="qship-brief-header-main">
          <h1>Billing & plans</h1>
          <p>
            {data.organizationName} · {data.planName} plan · {data.aiReviewCredits} AI review credits
            remaining
          </p>
        </div>
      </header>

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

      <div className="qship-req-list" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {data.plans.map((plan) => {
          const active = plan.id === data.planTier;
          return (
            <div key={plan.id} className="qship-req-row" style={{ cursor: "default", padding: 20 }}>
              <div className="qship-req-row-top">
                <strong>{plan.name}</strong>
                {active ? (
                  <span className="qship-req-status-pill">Current</span>
                ) : null}
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
                disabled={active || checkout.isPending}
                onClick={() => checkout.mutate({ planTier: plan.id })}
              >
                {checkout.isPending ? (
                  <Loader2 size={14} className="qship-spin" />
                ) : active ? (
                  <>
                    <Check size={14} /> Active plan
                  </>
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

      {!data.razorpayConfigured ? (
        <p className="qship-req-rec" style={{ marginTop: 20 }}>
          <Sparkles size={14} style={{ verticalAlign: -2 }} /> Razorpay keys not set — upgrades apply instantly in
          demo mode. Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> for live checkout.
        </p>
      ) : null}
    </div>
  );
}
