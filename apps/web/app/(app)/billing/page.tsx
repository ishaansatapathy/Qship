"use client";

import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { BILLING_PLAN_LIST } from "@repo/services/billing/plans";

import { useQshipUser } from "~/components/app/use-qship-user";
import { useRazorpayCheckout } from "~/components/app/use-razorpay-checkout";
import { trpc } from "~/trpc/client";

export default function BillingPage() {
  const utils = trpc.useUtils();
  const { user } = useQshipUser();
  const { ready: razorpayReady, openCheckout } = useRazorpayCheckout();
  const summary = trpc.billing.summary.useQuery(
    {},
    { retry: 1, refetchOnWindowFocus: false },
  );
  const confirmPayment = trpc.billing.confirmPayment.useMutation({
    onSuccess: async (result) => {
      toast.success(`Upgraded to ${result.planName}`);
      await utils.billing.summary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const checkout = trpc.billing.createCheckout.useMutation({
    onSuccess: async (result) => {
      if (result.mode === "demo") {
        toast.success(`Upgraded to ${result.planName} (demo mode)`);
        await utils.billing.summary.invalidate();
        return;
      }

      if (!razorpayReady) {
        toast.error("Razorpay checkout script still loading — try again in a moment.");
        return;
      }

      try {
        await openCheckout({
          key: result.keyId,
          amount: result.amount,
          currency: result.currency,
          name: "ShipFlow",
          description: `${result.planName} plan`,
          order_id: result.orderId,
          prefill: {
            name: result.organizationName,
            email: user?.email ?? undefined,
          },
          theme: { color: "#dc2626" },
          handler: (response) => {
            confirmPayment.mutate({
              planTier: result.planTier as "pro" | "enterprise",
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
          },
          modal: {
            ondismiss: () => toast.message("Checkout closed"),
          },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not open Razorpay checkout");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const data = summary.data;
  const plans = data?.plans ?? BILLING_PLAN_LIST;
  const activeTier = data?.planTier ?? "free";
  const checkoutReady = summary.isSuccess && Boolean(data);
  const razorpayConfigured = data?.razorpayConfigured ?? false;
  const paying = checkout.isPending || confirmPayment.isPending;

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
          const disabled = !checkoutReady || active || paying;
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
                {paying ? (
                  <Loader2 size={14} className="qship-spin" />
                ) : active ? (
                  <>
                    <Check size={14} /> Active plan
                  </>
                ) : !checkoutReady ? (
                  "Connect API to upgrade"
                ) : (
                  <>
                    <CreditCard size={14} /> {plan.priceInr === 0 ? "Downgrade" : "Pay with Razorpay"}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {!razorpayConfigured ? (
        <p className="qship-req-rec" style={{ marginTop: 20 }}>
          <Sparkles size={14} style={{ verticalAlign: -2 }} /> Razorpay keys not set — paid plans
          upgrade instantly in <strong>demo mode</strong>. Add <code>RAZORPAY_KEY_ID</code>,{" "}
          <code>RAZORPAY_KEY_SECRET</code>, and optional <code>RAZORPAY_WEBHOOK_SECRET</code> in{" "}
          <code>.env</code> for live checkout + webhooks.
        </p>
      ) : (
        <p className="qship-req-rec" style={{ marginTop: 20 }}>
          <CreditCard size={14} style={{ verticalAlign: -2 }} /> Razorpay checkout is live. Test card:{" "}
          <code>4111 1111 1111 1111</code> · OTP <code>123456</code>. Webhook URL (API):{" "}
          <code>
            {process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://repoapi-production-adfe.up.railway.app"}
            /webhooks/razorpay
          </code>
          .
        </p>
      )}
    </div>
  );
}
