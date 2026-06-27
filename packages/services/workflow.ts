/** ShipFlow delivery lifecycle statuses */
export const FEATURE_STATUSES = [
  "submitted",
  "clarifying",
  "duplicate_education",
  "rejected",
  "prd_generating",
  "prd_ready",
  "planning",
  "plan_approved",
  "in_development",
  "pr_open",
  "ai_review",
  "fix_needed",
  "human_review",
  "approved",
  "shipped",
] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const ENGINEERING_TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
] as const;

export type EngineeringTaskStatus = (typeof ENGINEERING_TASK_STATUSES)[number];

/** Core loop phases for UI and agents */
export const SHIPFLOW_PHASES = {
  discovery: ["submitted", "clarifying", "duplicate_education", "rejected", "prd_generating", "prd_ready"],
  planning: ["planning", "plan_approved"],
  development: ["in_development", "pr_open"],
  aiReview: ["ai_review", "fix_needed"],
  release: ["human_review", "approved", "shipped"],
} as const;

export const WORKFLOW_TYPES = [
  "prd_generation",
  "task_generation",
  "repo_analysis",
  "pr_processing",
  "ai_review",
  "re_review",
  "release_readiness",
] as const;

export type WorkflowType = (typeof WORKFLOW_TYPES)[number];
