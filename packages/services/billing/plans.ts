export const BILLING_PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceInr: 0,
    aiReviewCredits: 10,
    repositoryLimit: 1,
    features: [
      "1 GitHub repository",
      "10 AI review credits",
      "Feature intake & PRD generation",
      "Basic Kanban task view",
    ],
  },
  test: {
    id: "test" as const,
    name: "Test Plan",
    priceInr: 19,
    aiReviewCredits: 30,
    repositoryLimit: 3,
    badge: "Trial" as const,
    features: [
      "3 GitHub repositories",
      "30 AI review credits",
      "Full intake → PRD → tasks pipeline",
      "Slack notifications on approval",
      "Priority agent queue",
    ],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceInr: 999,
    aiReviewCredits: 100,
    repositoryLimit: 10,
    features: [
      "10 GitHub repositories",
      "100 AI review credits per purchase",
      "Full delivery workflow with QA agent",
      "Human-in-the-loop approval gates",
      "Webhook + MCP integration",
      "Priority support",
    ],
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    priceInr: 4999,
    aiReviewCredits: 9999,
    repositoryLimit: 999,
    features: [
      "Unlimited repositories",
      "9999 AI review credits per purchase",
      "All Pro features",
      "Custom agent guardrails",
      "Dedicated onboarding",
    ],
  },
} as const;

export type PlanTier = keyof typeof BILLING_PLANS;

export const BILLING_PLAN_LIST = Object.values(BILLING_PLANS);

/** Customer-facing plans (all tiers including Test Plan are publicly visible). */
export function getVisibleBillingPlans() {
  return BILLING_PLAN_LIST;
}

export function formatPlanPrice(plan: (typeof BILLING_PLANS)[PlanTier]) {
  if (plan.priceInr === 0) return "Free";
  return `₹${plan.priceInr}`;
}
