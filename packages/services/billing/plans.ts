export const BILLING_PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceInr: 0,
    aiReviewCredits: 10,
    repositoryLimit: 1,
    features: ["Pipeline overview", "10 AI reviews / month", "1 linked repo"],
  },
  test: {
    id: "test" as const,
    name: "Test",
    priceInr: 10,
    aiReviewCredits: 20,
    repositoryLimit: 2,
    features: ["Live payment test (₹10)", "20 AI reviews", "2 repos"],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceInr: 999,
    aiReviewCredits: 100,
    repositoryLimit: 10,
    features: ["Unlimited feature requests", "100 AI reviews / month", "10 repos", "Priority support"],
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    priceInr: 4999,
    aiReviewCredits: 9999,
    repositoryLimit: 999,
    features: ["Unlimited reviews", "Unlimited repos", "SSO", "Dedicated support"],
  },
} as const;

export type PlanTier = keyof typeof BILLING_PLANS;

export const BILLING_PLAN_LIST = Object.values(BILLING_PLANS);
