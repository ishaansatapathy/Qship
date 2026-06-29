export const BILLING_PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceInr: 0,
    aiReviewCredits: 10,
    repositoryLimit: 1,
    features: ["Pipeline overview", "10 AI review credits included"],
  },
  test: {
    id: "test" as const,
    name: "Test",
    priceInr: 10,
    aiReviewCredits: 20,
    repositoryLimit: 2,
    features: ["Live payment smoke test", "20 AI review credits included"],
    internalOnly: true as const,
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceInr: 999,
    aiReviewCredits: 100,
    repositoryLimit: 10,
    features: ["100 AI review credits per purchase", "Full delivery workflow"],
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    priceInr: 4999,
    aiReviewCredits: 9999,
    repositoryLimit: 999,
    features: ["9999 AI review credits per purchase", "Full delivery workflow"],
  },
} as const;

export type PlanTier = keyof typeof BILLING_PLANS;

export const BILLING_PLAN_LIST = Object.values(BILLING_PLANS);

/** Customer-facing plans. Test tier requires BILLING_ENABLE_TEST_PLAN=true. */
export function getVisibleBillingPlans() {
  const showTest = process.env.BILLING_ENABLE_TEST_PLAN === "true";
  return BILLING_PLAN_LIST.filter((plan) => plan.id !== "test" || showTest);
}

export function formatPlanPrice(plan: (typeof BILLING_PLANS)[PlanTier]) {
  if (plan.priceInr === 0) return "Free";
  return `₹${plan.priceInr}`;
}
